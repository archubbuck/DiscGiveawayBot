import { ArgumentParser } from "argparse";
import { Client, Constants, DMChannel, TextChannel, User } from "discord.js-selfbot-v13";
import path from "path";
import { Settings } from "./settings";
import fs from "fs";
import crypto from "crypto";

const parser = new ArgumentParser();

parser.add_argument('-s', '--settings', { help: 'The path to the settings file.' });

const args = parser.parse_args();

console.log(args);

const settingsFilePath = path.resolve(args.settings);

console.log(settingsFilePath);

const getSettings = (filePath: string): Settings => {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

let settings: Settings = getSettings(settingsFilePath);

fs.watchFile(settingsFilePath, () => {
    settings = getSettings(settingsFilePath);
});

const shutdown = (message?: string) => {
    if (message) console.log(message);
    console.log("Shutting down...");
    process.exit(1);
}

const start = async () => {

    let owner: User;
    let ownerDmChannel: DMChannel;
    let channelToMonitor: TextChannel;

    /**
     * Create the client
     */

    const client = new Client({
        checkUpdate: false
    });

    /**
     * When the account is finished signing in
     */

    client.once(Constants.Events.CLIENT_READY, async () => {
        console.log(`Logged in as ${client.user!.username}!`);

        await client.users.fetch(settings.ownerId).then((user) => {
            console.log(user);
            owner = user;
        });

        await owner.createDM(true).then((dmChannel) => {
            console.log(dmChannel);
            ownerDmChannel = dmChannel;
        });

        await client.channels.fetch(settings.channelIdToMonitor).then((channel) => {
            console.log(channel);
            if (!channel) shutdown(`Unable to locate channel with the id of ${settings.channelIdToMonitor}`);
            if (channel!.type !== 'GUILD_TEXT') shutdown(`${settings.channelIdToMonitor} must be a text channel.`);
            channelToMonitor = channel as TextChannel;
            return;
        });
    });

    /**
     * When a message is received
     */
    
    client.on(Constants.Events.MESSAGE_CREATE, async (message) => {

        if (message.channelId !== channelToMonitor.id) return;
        if (message.author.id === client.user?.id) return;
        if (!message.author.bot && message.author.id !== owner.id) return;

        const guildChannel = message.channel as TextChannel;

        if (
            guildChannel.name.toLowerCase().includes("giveaway") ||
            message.content.toLowerCase().includes("giveaway")
        ) {
            const dmChannelMessage = await ownerDmChannel.send({
                content: `[Message:${message.id}]: Giveaway detected in [Channel:${guildChannel.id}] ${guildChannel} on [Server:${guildChannel.guildId}] ${guildChannel.guild.name}\n${message.url}`
            });
            await dmChannelMessage.react('💰');
            return;
        }

    });

    /**
     * When a reaction is added
     */

    client.on(Constants.Events.MESSAGE_REACTION_ADD, async (messageReaction, user) => {
        if (user.id === client.user?.id) return;
        if (messageReaction.message.channelId !== ownerDmChannel.id) return;
        if (messageReaction.emoji.name !== '💰') return;

        const r = await messageReaction.fetch();

        const [, giveawayMessageId] = r.message.content?.match(/\[Message:(.*?)]/) || [];

        const giveawayMessage = await channelToMonitor.messages.fetch(giveawayMessageId);
        for (const [reaction] of giveawayMessage.reactions.cache) {
            const delayInMs = crypto.randomInt(350, 1150);
            console.log(`Delaying reaction by ${delayInMs}ms`);
            new Promise(resolve => setTimeout(resolve, delayInMs));
            await giveawayMessage.react(reaction);
        }
    });

    client.login(settings.token);
};

start()
    .catch((error) => shutdown(error));