// 3rd
import assert from "assert";
// 1st
import Client from "../discord/client";
import * as config from "../config";
import * as pre from "../presenters";

//
// TODO: DRY up these functions.
// TODO: Avoid the #staff-channel lookup on every function call.
//

////////////////////////////////////////////////////////////

function makeClient(): Client | null {
  if (!config.DISCORD_BOT_TOKEN) {
    return null;
  }
  return new Client({ botToken: config.DISCORD_BOT_TOKEN });
}

////////////////////////////////////////////////////////////

// nuker and spambot are users
export const broadcastManualNuke = async ({ nuker, spambot }) => {
  if (!config.IS_DISCORD_CONFIGURED) {
    console.warn(`
      Called services.discord.js#broadcastManualNuke but Discord
      is not configured.
    `);
    return;
  }
  assert(nuker);
  assert(spambot);
  pre.presentUser(nuker);
  pre.presentUser(spambot);

  const client = makeClient();
  if (!client) {
    console.warn(
      "Called services.discord.js#broadcastManualNuke but Discord is not configured.",
    );
    return;
  }

  const channel = await client
    .listGuildChannels(config.DISCORD_GUILD_ID!)
    .then((cs) => cs.find((c) => c.name === "forum-activity"));

  if (!channel) {
    console.warn(`Could not find a #forum-activity channel for broadcast.`);
    return;
  }

  const content = `:hammer: **${nuker.uname}** nuked ${config.HOST}${
    spambot.url
  } :radioactive:`;

  console.log(content);

  // Broadcast
  await client.createMessage(channel.id, { content });
};

////////////////////////////////////////////////////////////

// nuker and spambot are users
export const broadcastManualUnnuke = async ({ nuker, spambot }) => {
  assert(nuker);
  assert(spambot);
  pre.presentUser(nuker);
  pre.presentUser(spambot);

  const client = makeClient();
  if (!client) {
    console.warn(
      "Called services.discord.js#broadcastManualUnnuke but Discord is not configured.",
    );
    return;
  }

  const channel = await client
    .listGuildChannels(config.DISCORD_GUILD_ID!)
    .then((cs) => cs.find((c) => c.name === "forum-activity"));

  if (!channel) {
    console.warn(`Could not find a #forum-activity channel for broadcast.`);
    return;
  }

  const content = `:white_check_mark: **${nuker.uname}** UN-nuked ${
    config.HOST
  }${spambot.url}`;

  // Broadcast
  await client.createMessage(channel.id, { content });
};

////////////////////////////////////////////////////////////

// When a user is auto-nuked because of their IP address
export const broadcastIpAddressAutoNuke = async (user, ipAddress) => {
  assert(user);
  assert(typeof ipAddress === "string");

  // Need url
  pre.presentUser(user);

  const client = makeClient();
  if (!client) {
    console.warn(
      "Called services.discord.js#broadcastIpAddressAutoNuke but Discord is not configured.",
    );
    return;
  }

  const channel = await client
    .listGuildChannels(config.DISCORD_GUILD_ID!)
    .then((cs) => cs.find((c) => c.name === "forum-activity"));

  if (!channel) {
    console.warn(`Could not find a #forum-activity channel for broadcast.`);
    return;
  }

  const content = `@here :spy: User ${config.HOST}${
    user.url
  } was auto-nuked (vpn/proxy/bad: https://ipinfo.io/${
    ipAddress
  }) :radioactive:`;

  // Broadcast
  await client.createMessage(channel.id, { content });
};

////////////////////////////////////////////////////////////

// Info is an object of arbitrary data about the analysis
// to be sent along with the broadcast for debugging purposes.
export const broadcastAutoNuke = async (user, postId, info) => {
  assert(user);
  assert(Number.isInteger(postId));

  // Need url
  pre.presentUser(user);

  if (!config.IS_DISCORD_CONFIGURED) {
    console.error(`
      Called services.discord.js#broadcastAutoNuke but Discord
      is not configured.
    `);
    return;
  }

  const client = makeClient();
  if (!client) {
    console.warn(
      "Called services.discord.js#broadcastAutoNuke but Discord is not configured.",
    );
    return;
  }

  const channel = await client
    .listGuildChannels(config.DISCORD_GUILD_ID!)
    .then((cs) => cs.find((c) => c.name === "forum-activity"));

  if (!channel) {
    console.warn(`Could not find a #forum-activity channel for broadcast.`);
    return;
  }

  const content = `@here :robot: User ${config.HOST}${
    user.url
  } was auto-nuked for this post: ${config.HOST}/posts/${
    postId
  }/raw :radioactive:

\`\`\`
${JSON.stringify(info, null, 2)}
\`\`\`
  `.trim();

  // Broadcast
  await client.createMessage(channel.id, { content });
};

////////////////////////////////////////////////////////////

export const broadcastUserJoin = async (user) => {
  // Need url
  pre.presentUser(user);

  if (!config.IS_DISCORD_CONFIGURED) {
    console.error(`
      Called services.discord.js#broadcastUserJoin but Discord
      is not configured.
    `);
    return;
  }

  const client = makeClient();
  if (!client) {
    console.warn(
      "Called services.discord.js#broadcastUserJoin but Discord is not configured.",
    );
    return;
  }

  const channel = await client
    .listGuildChannels(config.DISCORD_GUILD_ID!)
    .then((cs) => cs.find((c) => c.name === "forum-activity"));

  if (!channel) {
    console.warn(`Could not find a #forum-activity channel for broadcast.`);
    return;
  }

  // Broadcast
  await client.createMessage(channel.id, {
    content: `@here :baby: A new user joined: ${config.HOST}${user.url}`,
  });
};

////////////////////////////////////////////////////////////

export const broadcastIntroTopic = async (user, topic) => {
  // Need url
  pre.presentUser(user);
  pre.presentTopic(topic);

  const client = makeClient();
  if (!client) {
    console.warn(
      "Called services.discord.js#broadcastIntroTopic but Discord is not configured.",
    );
    return;
  }

  const channel = await client
    .listGuildChannels(config.DISCORD_GUILD_ID!)
    .then((cs) => cs.find((c) => c.name === "general"));

  if (!channel) {
    console.error(`Could not find a #general channel for broadcast.`);
    return;
  }

  // Broadcast
  await client.createMessage(channel.id, {
    content: `Howdy, :wave: **${
      user.uname
    }** created an Introduce Yourself thread: ${config.HOST}${
      topic.url
    }. Please help us welcome them!`,
  });
};

////////////////////////////////////////////////////////////

export async function broadcastBioUpdate(user, bioMarkup) {
  assert(user);
  assert(typeof bioMarkup === "string");

  pre.presentUser(user);

  const client = makeClient();
  if (!client) {
    console.warn(
      "Called services.discord.js#broadcastBioUpdate but Discord is not configured.",
    );
    return;
  }

  const channel = await client
    .listGuildChannels(config.DISCORD_GUILD_ID!)
    .then((cs) => cs.find((c) => c.name === "forum-activity"));

  if (!channel) {
    console.error(`Could not find a #general channel for broadcast.`);
    return;
  }

  // Broadcast
  await client.createMessage(channel.id, {
    content: `:eye: ${config.HOST}${user.url} just set their bio. Is it spam?
Snippet: \`${bioMarkup.slice(0, 140)}\`
`,
  });
}
