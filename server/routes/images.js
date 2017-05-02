'use strict';
// Node
const fs = require('fs');
// 3rd
const assert = require('better-assert');
const router = require('koa-router')();
const debug = require('debug')('app:routes:images');
const gm = require('gm').subClass({ imageMagick: true });
const Uploader = require('s3-streaming-upload').Uploader;
const uuidGen = require('node-uuid');
const AWS = require('aws-sdk');
// 1st
const belt = require('../belt')
const db = require('../db');
const pre = require('../presenters');
const config = require('../config');

////////////////////////////////////////////////////////////

const s3 = new AWS.S3({ apiVersion: '2006-03-01' });

////////////////////////////////////////////////////////////

async function loadUser (ctx, next) {
  const user = await db.getUserBySlug(ctx.params.user_slug);
  pre.presentUser(user);
  ctx.assert(user, 404);
  ctx.state.user = user;
  return next()
}

async function loadImage (ctx, next) {
  ctx.assert(belt.isValidUuid(ctx.params.image_id), 404)
  const image = await db.images.getImage(ctx.params.image_id);
  pre.presentImage(image);
  ctx.assert(image, 404);
  ctx.state.image = image;
  return next()
}

async function loadAlbum (ctx, next) {
  ctx.assert(/^[0-9]+$/.test(ctx.params.album_id), 404)
  const album = await db.images.getAlbum(ctx.params.album_id);
  pre.presentAlbum(album);
  ctx.assert(album, 404);
  ctx.state.album = album;
  return next()
}

////////////////////////////////////////////////////////////

// ImageMagick identify object -> Mimetype string
function identifyToMime (data) {
  if (data['Mime type']) {
    return data['Mime type'];
  }
  switch (data.format) {
    case 'GIF': return 'image/gif';
    case 'JPEG': return 'image/jpeg';
    case 'PNG': return 'image/png';
  }
}

function extToMime (ext) {
  switch (ext) {
    case 'gif': return 'image/gif';
    case 'jpg': return 'image/jpeg';
    case 'png': return 'image/png';
  }
}

function mimeToExt (mime) {
  switch (mime) {
    case 'image/gif': return 'gif';
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
  }
}

router.get('/images/:image_id.:ext', loadImage, async (ctx) => {
  ctx.assert(extToMime(ctx.params.ext) === ctx.state.image.mime, 404);
  ctx.set('Cache-Control', 'max-age=31556926');
  ctx.type = ctx.state.image.mime;
  ctx.body = ctx.state.image.blob;
});

router.get('/users/:user_slug/images/:image_id', loadUser, loadImage, async (ctx) => {
  await ctx.render('show_user_image', {
    ctx,
    image: ctx.state.image,
    user: ctx.state.user,
    title: 'Image'
  });
});

router.get('/users/:user_slug/images', loadUser, async (ctx) => {
  // template: views/show_user_images.html
  const images = await db.images.getUserImages(ctx.state.user.id);
  images.forEach(pre.presentImage);
  const albums = await db.images.getUserAlbums(ctx.state.user.id);
  albums.forEach(pre.presentAlbum);
  await ctx.render('show_user_images', {
    ctx,
    images,
    albums,
    user: ctx.state.user,
    title: `${ctx.state.user.uname}'s Images`
  });
});

////////////////////////////////////////////////////////////
// Upload

function identify (path) {
  return new Promise(function (resolve, reject) {
    gm(path)
      .identify(function (err, val) {
        if (err) return reject(err);
        return resolve(val);
      });
  });
}

// String -> Buffer
function readPath (path) {
  return new Promise(function (resolve, reject) {
    fs.readFile(path, function (err, buf) {
      if (err) return reject(err);
      return resolve(buf);
    });
  });
}

// returns promise that resolves into s3 url of uploaded image
function uploadImage (key, path, mime) {
  assert(typeof key === 'string');
  assert(typeof path === 'string');
  assert(typeof mime === 'string');
  const inStream = fs.createReadStream(path);
  const uploader = new Uploader({
    stream: inStream,
    accessKey: config.AWS_KEY,
    secretKey: config.AWS_SECRET,
    bucket: config.S3_IMAGE_BUCKET,
    objectName: key,
    objectParams: {
      'ContentType': mime,
      'CacheControl': 'max-age=31536000' // 1 year
    }
  });
  return new Promise(function (resolve, reject) {
    uploader.send(function (err, data) {
      if (err) return reject(err);
      const srcUrl = data.Location;
      assert(typeof srcUrl === 'string');
      return resolve(srcUrl);
    });
  });
}

function deleteObject (key) {
  const params = {
    'Bucket': config.S3_IMAGE_BUCKET,
    'Key': key
  };
  return new Promise(function (resolve, reject) {
    s3.deleteObject(params, function (err, data) {
      if (err) return reject(err);
      return resolve();
    });
  });
}

router.post('/users/:user_slug/images', loadUser, async (ctx) => {
  if (!config.S3_IMAGE_BUCKET) {
    return ctx.body = 'The upload system is currently offline. (Bucket unspecified)';
  }
  ctx.assertAuthorized(ctx.currUser, 'UPLOAD_IMAGE', ctx.state.user);
  // FIXME: Lame validation
  // fields
  ctx.assert(ctx.request.body.fields, 400);
  ctx.assert(typeof ctx.request.body.fields.description === 'string', 400);
  const description = ctx.request.body.fields.description;
  ctx.assert(description.length <= 10000, 400);
  const albumId = ctx.request.body.fields.album_id;
  ctx.assert(Number.parseInt(albumId), 400);
  const album = await db.images.getAlbum(albumId);
  ctx.assert(album, 404);
  // files
  ctx.assert(ctx.request.body.files, 400);
  ctx.assert(ctx.request.body.files.image, 400);
  const upload = ctx.request.body.files.image;
  ctx.assert(Number.isInteger(upload.size), 400);
  ctx.assert(typeof upload.path === 'string', 400);
  // ensure max upload size
  if (upload.size > 2e6) {
    ctx.flash = { message: ['danger', `Image cannot exceed 2 MB. Max: 2,000,000. Yours: ${upload.size}`] };
    return ctx.redirect('back');
  }
  // { 'Mime type': 'image/jpeg' OR 'format': 'JPEG' }
  const data = await identify(upload.path);
  const mime = identifyToMime(data);
  if (!mime || ['image/jpeg', 'image/png', 'image/gif'].indexOf(mime) < 0) {
    ctx.flash = { message: ['danger', 'Invalid image format. Must be jpg, gif, png.'] };
    return ctx.redirect('back');
  }

  // UPLOAD

  const uuid = uuidGen.v4();
  const envFolder = config.NODE_ENV === 'production' ? 'prod' : 'dev';
  const s3Key = `${envFolder}/users/${uuid}.${mimeToExt(mime)}`;
  const url = await uploadImage(s3Key, upload.path, mime);

  // INSERT

  await db.images.insertImage(uuid, album.id, ctx.state.user.id, url, mime, description);

  // RESPOND

  ctx.flash = { message: ['success', 'Image uploaded'] };
  ctx.redirect(ctx.state.user.url + '/images');
});

// TODO: Also delete from S3
router.del('/users/:user_slug/images/:image_id', loadUser, loadImage, async (ctx) => {
  ctx.assertAuthorized(ctx.currUser, 'MANAGE_IMAGES', ctx.state.user);
  await db.images.deleteImage(ctx.state.image.id);
  ctx.flash = { message: ['success', 'Image deleted'] };
  ctx.redirect(ctx.state.user.url + '/images');
});

// albums

router.get('/albums/:album_id', loadAlbum, async (ctx) => {
  const images = await db.images.getAlbumImages(ctx.state.album.id);
  images.forEach(pre.presentImage);
  await ctx.render('show_album', {
    ctx,
    user: ctx.state.album.user,
    album: ctx.state.album,
    images
  });
});

// update album
//
// Body:
// - title: Required String
// - markup: Optional String
router.put('/users/:user_slug/albums/:album_id', loadUser, loadAlbum, async (ctx) => {
  // AUTHZ
  ctx.assertAuthorized(ctx.currUser, 'MANAGE_IMAGES', ctx.state.user);
  // VALIDATE
  ctx.validateBody('title')
    .isString()
    .isLength(1, 300, 'Title must be 1-300 chars');
  ctx.validateBody('markup')
    .toString()
    .isLength(0, 10000, 'Description cannot be more than 10k chars');
  // SAVE
  await db.images.updateAlbum(ctx.state.album.id, {
    title: ctx.vals.title,
    markup: ctx.vals.markup
  });
  // RESPOND
  ctx.flash = { message: ['success', 'Album updated'] };
  ctx.redirect(ctx.state.album.url);
});

router.post('/users/:user_slug/albums', loadUser, async (ctx) => {
  ctx.assertAuthorized(ctx.currUser, 'MANAGE_IMAGES', ctx.state.user);
  ctx.validateBody('title')
    .isString()
    .isLength(1, 300, 'Title must be 1-300 chars');
  ctx.validateBody('markup')
    .isLength(0, 10000, 'Description cannot be more than 10k chars');
  const album = await db.images.insertAlbum(ctx.state.user.id, ctx.vals.title, ctx.vals.markup);
  pre.presentAlbum(album);
  ctx.flash = { message: ['success', 'Album created'] };
  ctx.redirect(album.url);
});


////////////////////////////////////////////////////////////

module.exports = router;
