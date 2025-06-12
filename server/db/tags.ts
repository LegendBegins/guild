// 3rd
const assert = require('assert')
const { sql } = require('pg-extra')
// 1st
const { pool } = require('./util')

////////////////////////////////////////////////////////////

exports.getTag = async id => {
    assert(Number.isInteger(id))

    return pool.one(sql`
    SELECT *
    FROM tags
    WHERE id = ${id}
  `)
}

////////////////////////////////////////////////////////////

exports.getGroup = async id => {
    return pool
        .one(
            sql`
    SELECT
      tg.*,
      json_agg(tags.*) tags
    FROM tag_groups tg
    LEFT JOIN tags ON tags.tag_group_id = tg.id
    WHERE tg.id = ${id}
    GROUP BY tg.id
  `
        )
        .then(x => {
            if (!x) return null
            // Turn [null] into [] if no tags
            x.tags = x.tags.filter(Boolean)
            return x
        })
}

exports.listGroups = async () => {
    return pool
        .many(
            sql`
    SELECT
      tg.*,
      json_agg(tags.*) tags
    FROM tag_groups tg
    LEFT JOIN tags ON tags.tag_group_id = tg.id
    GROUP BY tg.id
    ORDER BY tg.id
  `
        )
        .then(xs =>
            xs.map(x => {
                // Turn [null] into [] if no tags
                x.tags = x.tags.filter(Boolean)
                return x
            })
        )
}

////////////////////////////////////////////////////////////

exports.insertTagGroup = async title => {
    return pool.one(sql`
    INSERT INTO tag_groups (title)
    VALUES (${title})
    RETURNING *
  `)
}

////////////////////////////////////////////////////////////

exports.insertTag = async (groupId, title, desc) => {
    assert(Number.isInteger(groupId))
    assert(typeof title === 'string')

    return pool.one(sql`
    INSERT INTO tags (tag_group_id, title, description)
    VALUES (${groupId}, ${title}, ${desc})
    RETURNING *
  `)
}

////////////////////////////////////////////////////////////

exports.moveTag = async (tagId, toGroupId) => {
    assert(Number.isInteger(tagId))
    assert(Number.isInteger(toGroupId))

    return pool.one(sql`
    UPDATE tags
    SET tag_group_id = ${toGroupId}
    WHERE id = ${tagId}
  `)
}
