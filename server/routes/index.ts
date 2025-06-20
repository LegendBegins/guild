"use strict";
// 3rd
import assert from "assert";
import Router from "@koa/router";
import Knex from "knex";
// import createDebug from 'debug'
// const debug = createDebug('app:routes:index')
import _ from "lodash";
import nodeUrl from "url";
// 1st
import * as config from "../config";
import * as cancan from "../cancan";
import * as db from "../db";
import cache3 from "../cache3";
import * as pre from "../presenters";
import { pool } from "../db/util.js";
import { Context } from "koa";

const knex = Knex({
  client: "pg",
});

////////////////////////////////////////////////////////////

const router = new Router();

////////////////////////////////////////////////////////////

// Depends on FAQ_POST_ID
router.get("/faq", async (ctx: Context) => {
  const post = pre.presentPost(cache3.get("faq-post"));

  await ctx.render("faq", {
    ctx,
    post,
    title: "FAQ",
  });
});

////////////////////////////////////////////////////////////

// async function listRoleplays_OLD(logic, sort, selectedTagIds = [], beforeId) {
//     assert(['any', 'all'].includes(logic))
//     assert(['bumped', 'created'].includes(sort))
//     assert(Array.isArray(selectedTagIds))
//     assert(typeof beforeId === 'undefined' || Number.isInteger(beforeId))

//     const perPage = 20

//     return pool.many(
//         sql`
//     SELECT
//       t.*,
//       to_json(f.*) "forum",
//       json_build_object(
//         'uname', u.uname,
//         'slug', u.slug
//       ) "user",
//       CASE
//         WHEN ic_posts IS NULL THEN NULL
//         ELSE json_build_object(
//           'id', ic_posts.id,
//           'created_at', ic_posts.created_at
//         )
//       END "latest_ic_post",
//       CASE
//         WHEN ic_users IS NULL THEN NULL
//         ELSE json_build_object(
//         'uname', ic_users.uname,
//         'slug', ic_users.slug
//         )
//       END "latest_ic_user",
//       CASE
//         WHEN ooc_posts IS NULL THEN NULL
//         ELSE json_build_object(
//           'id', ooc_posts.id,
//           'created_at', ooc_posts.created_at
//         )
//       END "latest_ooc_post",
//       CASE
//         WHEN ooc_users IS NULL THEN NULL
//         ELSE json_build_object(
//         'uname', ooc_users.uname,
//         'slug', ooc_users.slug
//         )
//       END "latest_ooc_user",
//       CASE
//         WHEN char_posts IS NULL THEN NULL
//         ELSE json_build_object(
//           'id', char_posts.id,
//           'created_at', char_posts.created_at
//         )
//       END "latest_char_post",
//       CASE
//         WHEN char_users IS NULL THEN NULL
//         ELSE json_build_object(
//         'uname', char_users.uname,
//         'slug', char_users.slug
//         )
//       END "latest_char_user",
//       (
//         SELECT json_agg(tags.*)
//         FROM tags
//         JOIN tags_topics ON tags.id = tags_topics.tag_id
//         JOIN topics ON tags_topics.topic_id = topics.id
//         WHERE topics.id = t.id
//       ) "tags"
//     FROM (
//       SELECT topics.*
//       FROM topics
//       , LATERAL (
//           SELECT array_agg(tt.tag_id) "tag_ids"
//           FROM tags_topics tt
//           WHERE topics.id = tt.topic_id
//           GROUP BY topics.id
//       ) s
//       JOIN tags ON tags.id = ANY (s.tag_ids)
//       WHERE topics.forum_id IN (3, 4, 5, 6, 7, 42, 39)
//         AND topics.is_hidden = false
//     `
//             .append(
//                 beforeId
//                     ? sort === 'created'
//                       ? sql`AND topics.id < ${beforeId}`
//                       : sql`AND topics.latest_post_id < ${beforeId}`
//                     : _raw``
//             )
//             .append(
//                 selectedTagIds.length > 0
//                     ? logic === 'any'
//                       ? sql`AND tags.id = ANY (${selectedTagIds})`
//                       : sql`AND ${selectedTagIds} <@ s.tag_ids`
//                     : _raw``
//             )
//             .append(sql`GROUP BY topics.id`)
//             .append(
//                 sort === 'created'
//                     ? sql`ORDER BY topics.created_at DESC`
//                     : sql`ORDER BY topics.latest_post_id DESC`
//             )
//             .append(
//                 sql`
//         LIMIT ${perPage}
//       ) t
//       JOIN users u ON t.user_id = u.id
//       JOIN forums f ON t.forum_id = f.id
//       JOIN posts latest_post ON t.latest_post_id = latest_post.id
//       JOIN users u2 ON latest_post.user_id = u2.id
//       LEFT OUTER JOIN posts ic_posts ON t.latest_ic_post_id = ic_posts.id
//       LEFT OUTER JOIN users ic_users ON ic_posts.user_id = ic_users.id
//       LEFT OUTER JOIN posts ooc_posts ON t.latest_ooc_post_id = ooc_posts.id
//       LEFT OUTER JOIN users ooc_users ON ooc_posts.user_id = ooc_users.id
//       LEFT OUTER JOIN posts char_posts ON t.latest_char_post_id = char_posts.id
//       LEFT OUTER JOIN users char_users ON char_posts.user_id = char_users.id
//     `
//             )
//             .append(
//                 sort === 'created'
//                     ? sql`ORDER BY t.created_at DESC`
//                     : sql`ORDER BY t.latest_post_id DESC`
//             )
//             .append(sql`LIMIT ${perPage}`)
//     )
// }

async function listRoleplays(
  logic: "any" | "all",
  sort: "created" | "bumped",
  selectedTagIds: number[] = [],
  beforeId: number | null,
) {
  assert(["any", "all"].includes(logic));
  assert(["created", "bumped"].includes(sort));
  assert(Array.isArray(selectedTagIds));
  assert(typeof beforeId === "undefined" || Number.isInteger(beforeId));

  const perPage = 20;

  const subquery = knex("topics")
    .select("topics.*")
    .from(
      knex.raw(
        'topics, LATERAL (SELECT array_agg(tt.tag_id) "tag_ids" FROM tags_topics tt WHERE topics.id = tt.topic_id GROUP BY topics.id) s',
      ),
    )
    .join("tags", knex.raw("tags.id = ANY (s.tag_ids)"))
    .whereIn("topics.forum_id", [3, 4, 5, 6, 7, 42, 39])
    .where("topics.is_hidden", false);

  // Dynamic WHERE clauses
  if (beforeId) {
    if (sort === "created") {
      subquery.where("topics.id", "<", beforeId);
    } else {
      subquery.where("topics.latest_post_id", "<", beforeId);
    }
  }

  if (selectedTagIds.length > 0) {
    if (logic === "any") {
      subquery.whereRaw("tags.id = ANY (?)", [selectedTagIds]);
    } else {
      subquery.whereRaw("? <@ s.tag_ids", [selectedTagIds]);
    }
  }

  subquery.groupBy("topics.id");

  // Dynamic ORDER BY
  if (sort === "created") {
    subquery.orderBy("topics.created_at", "desc");
  } else {
    subquery.orderBy("topics.latest_post_id", "desc");
  }

  subquery.limit(perPage);

  // Main query
  const query = knex
    .with("t", subquery)
    .select(
      "t.*",
      knex.raw("to_json(f.*) as forum"),
      knex.raw(`json_build_object('uname', u.uname, 'slug', u.slug) as user`),
      knex.raw(`
      CASE
        WHEN ic_posts IS NULL THEN NULL
        ELSE json_build_object(
          'id', ic_posts.id,
          'created_at', ic_posts.created_at
        )
      END as latest_ic_post
    `),
      knex.raw(`
      CASE
        WHEN ic_users IS NULL THEN NULL
        ELSE json_build_object(
          'uname', ic_users.uname,
          'slug', ic_users.slug
        )
      END as latest_ic_user
    `),
      knex.raw(`
      CASE
        WHEN ooc_posts IS NULL THEN NULL
        ELSE json_build_object(
          'id', ooc_posts.id,
          'created_at', ooc_posts.created_at
        )
      END as latest_ooc_post
    `),
      knex.raw(`
      CASE
        WHEN ooc_users IS NULL THEN NULL
        ELSE json_build_object(
          'uname', ooc_users.uname,
          'slug', ooc_users.slug
        )
      END as latest_ooc_user
    `),
      knex.raw(`
      CASE
        WHEN char_posts IS NULL THEN NULL
        ELSE json_build_object(
          'id', char_posts.id,
          'created_at', char_posts.created_at
        )
      END as latest_char_post
    `),
      knex.raw(`
      CASE
        WHEN char_users IS NULL THEN NULL
        ELSE json_build_object(
          'uname', char_users.uname,
          'slug', char_users.slug
        )
      END as latest_char_user
    `),
      knex.raw(`(
      SELECT json_agg(tags.*)
      FROM tags
      JOIN tags_topics ON tags.id = tags_topics.tag_id
      WHERE tags_topics.topic_id = t.id
    ) as tags`),
    )

    .from("t")
    .join("users as u", "t.user_id", "u.id")
    .join("forums as f", "t.forum_id", "f.id")
    .join("posts as latest_post", "t.latest_post_id", "latest_post.id")
    .join("users as u2", "latest_post.user_id", "u2.id")
    .leftJoin("posts as ic_posts", "t.latest_ic_post_id", "ic_posts.id")
    .leftJoin("users as ic_users", "ic_posts.user_id", "ic_users.id")
    .leftJoin("posts as ooc_posts", "t.latest_ooc_post_id", "ooc_posts.id")
    .leftJoin("users as ooc_users", "ooc_posts.user_id", "ooc_users.id")
    .leftJoin("posts as char_posts", "t.latest_char_post_id", "char_posts.id")
    .leftJoin("users as char_users", "char_posts.user_id", "char_users.id");

  if (sort === "created") {
    query.orderBy("t.created_at", "desc");
  } else {
    query.orderBy("t.latest_post_id", "desc");
  }

  query.limit(perPage);

  return pool.query(query.toString()).then((res) => res.rows);
}

router.get("/roleplays", async (ctx: Context) => {
  const tagGroups = cache3.get("tag-groups");

  // Should always be array. Empty array means all tags (no tag filter).
  const selectedTagIds = ctx
    .validateQuery("tags")
    .defaultTo([])
    .toArray()
    .toInts()
    .val();

  const sort = ctx
    .validateQuery("sort")
    .tap((v) => (["bumped", "created"].includes(v) ? v : "created"))
    .val();

  const beforeId = ctx.validateQuery("beforeId").optional().toInt().val();

  const logic = ctx
    .validateQuery("logic")
    .tap((v) => (["any", "all"].includes(v) ? v : "any"))
    .val();

  const roleplays = await listRoleplays(
    logic,
    sort,
    selectedTagIds,
    beforeId,
  ).then((xs) => xs.map((x) => pre.presentTopic(x)));

  const nextBeforeId = _.last(roleplays)
    ? sort === "created"
      ? _.last(roleplays).id
      : _.last(roleplays).latest_post_id
    : null;

  const nextPageUrl = nextBeforeId
    ? nodeUrl.format({
        host: config.HOST,
        pathname: ctx.path,
        query: Object.assign({}, _.pickBy(ctx.query, Boolean), {
          beforeId: nextBeforeId,
        }),
      })
    : null;

  const firstPageUrl = nodeUrl.format({
    host: config.HOST,
    pathname: ctx.path,
    query: _.pickBy(Object.assign({}, ctx.query, { beforeId: null }), Boolean),
  });

  await ctx.render("list_roleplays", {
    ctx,
    roleplays,
    // pagination
    beforeId,
    nextBeforeId,
    firstPageUrl,
    nextPageUrl,
    // tag filter
    logic,
    sort,
    tagGroups,
    selectedTagIds,
    //
    title: "Roleplays",
  });
});

////////////////////////////////////////////////////////////

router.get("/posts/:id/revisions", async (ctx: Context) => {
  const post = await db
    .findPostWithTopicAndForum(ctx.params.id)
    .then(pre.presentPost);
  ctx.assert(post, 404);
  ctx.assert(ctx.currUser, 404);
  cancan.isStaffRole(ctx.currUser.role) ||
    ctx.assertAuthorized(ctx.currUser, "UPDATE_POST", post);

  const revs = await db.revs
    .listPostRevs(post.id)
    .then((xs) => xs.map(pre.presentPostRev));

  await ctx.render("list_post_revisions", {
    ctx,
    revs,
    post,
    //
    title: `Post #${post.id} History`,
  });
});

////////////////////////////////////////////////////////////

router.get("/posts/:postId/revisions/:revId", async (ctx: Context) => {
  const revId = Number.parseInt(ctx.params.revId, 10);
  ctx.assert(!Number.isNaN(revId), 404);

  const post = await db
    .findPostWithTopicAndForum(ctx.params.postId)
    .then(pre.presentPost);
  ctx.assert(post, 404);
  ctx.assert(ctx.currUser, 404);
  cancan.isStaffRole(ctx.currUser.role) ||
    ctx.assertAuthorized(ctx.currUser, "UPDATE_POST", post);

  const rev = await db.revs.getPostRev(post.id, revId).then(pre.presentPostRev);
  ctx.assert(rev, 404);

  ctx.type = "html";
  ctx.body = `
    <head>
      <link rel="stylesheet" href="/css/general.css">
    </head>
    <body style="background-color: #2D2C2C; color: white;">
      <a href="/posts/${post.id}/revisions/${rev.id}/raw">View Raw</a>
      <hr>
      ${rev.html}
    </body>
  `;
});

router.get("/posts/:postId/revisions/:revId/raw", async (ctx: Context) => {
  const revId = Number.parseInt(ctx.params.revId, 10);
  ctx.assert(!Number.isNaN(revId), 404);

  const post = await db
    .findPostWithTopicAndForum(ctx.params.postId)
    .then(pre.presentPost);
  ctx.assert(post, 404);
  ctx.assert(ctx.currUser, 404);
  cancan.isStaffRole(ctx.currUser.role) ||
    ctx.assertAuthorized(ctx.currUser, "UPDATE_POST", post);

  const markup = await db.revs.getPostRevMarkup(post.id, revId);
  ctx.assert(markup, 404);

  ctx.type = "html";
  ctx.body = `
    <pre>${markup}</pre>
  `;
});

router.post("/posts/:postId/revisions/:revId/revert", async (ctx: Context) => {
  const revId = Number.parseInt(ctx.params.revId, 10);
  ctx.assert(!Number.isNaN(revId), 404);

  const post = await db
    .findPostWithTopicAndForum(ctx.params.postId)
    .then(pre.presentPost);
  ctx.assert(post, 404);
  ctx.assertAuthorized(ctx.currUser, "UPDATE_POST", post);

  const rev = await db.revs.getPostRev(post.id, revId).then(pre.presentPostRev);
  ctx.assert(rev, 404);

  await db.revs.revertPostRev(ctx.currUser.id, post.id, rev.id);

  ctx.flash = { message: ["success", `Reverted post to revision ${rev.id}`] };
  ctx.redirect(post.url + "/revisions");
});

////////////////////////////////////////////////////////////

export default router;
