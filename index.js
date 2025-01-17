require("dotenv").config();

const _ = require("lodash");
const slsk = require("slsk-client");
const Telegraf = require("telegraf");

const FILTER_WORDS = [
  "remix",
  "rmx",
  "edit",
  "cover",
  "live",
  "mix",
  "bootleg",
  "acapella",
  "mashup",
];

const humanFilesize = (size) => {
  var i = Math.floor(Math.log(size) / Math.log(1024));
  return (size / Math.pow(1024, i)).toFixed(2) * 1 + " " + ["B", "kB", "MB", "GB", "TB"][i];
};

const handleErr = (ctx, err) => {
  console.error(err);
  if (ctx) {
    ctx.reply(err);
  }
};

const sendMessage = (ctx, msg) => {
  console.log(msg);
  if (ctx) {
    ctx.reply(msg);
  }
};

const sendAudio = (ctx, audioUrl) => {
  ctx.telegram.sendAudio(ctx, audioUrl);
};

const basename = (filename) => {
  const split = filename.split("\\");
  return split[split.length - 1];
};

const filterResult = (r, query) => {
  const filename = basename(r.file);
  const splitQuery = query.split(" - ");
  const splitFilename = filename.split(" - ");

  return (
    r.bitrate >= 320 &&
    r.file.endsWith(".mp3") &&
    _.every(splitQuery, (piece, i) => {
      try {
        return splitFilename[i].toLowerCase().includes(piece.toLowerCase());
      } catch (e) {
        return false;
      }
    }) &&
    _.every(FILTER_WORDS, (word) => {
      return !filename.toLowerCase().includes(word) || query.toLowerCase().includes(word);
    })
  );
};

const formatResult = (r) => {
  return `|${r.bitrate}| ${basename(r.file)} (${humanFilesize(r.size)}) [slots: ${r.slots}]`;
};

const retrieveFile = (soulseek, ctx, result, filename) => {
  const downloadPath = __dirname + "/download/" + filename;
  soulseek.download(
    {
      file: result,
      path: downloadPath,
    },
    (err, data) => {
      if (err) {
        handleErr(ctx, err);
      }
      sendMessage(ctx, `Download of "${downloadPath}" completed!`);
      ctx.replyWithAudio({
        source: downloadPath,
      });
    }
  );
};

const onDownload = async (soulseek, ctx, query) => {
  sendMessage(ctx, `Searching: ${query}`);
  const req = query.toLowerCase().replace(" - ", " ");
  soulseek.search({ req, timeout: 20000 }, (err, rawResults) => {
    if (err) {
      handleErr(ctx, err);
    }
    const sorted = _.sortBy(rawResults, ["speed", "slots"]);
    const filtered = sorted.filter((r) => {
      return filterResult(r, query);
    });
    if (filtered.length === 0) {
      const resultsString = _.map(sorted, formatResult).join("\n");
      sendMessage(ctx, `Found 0 results (${rawResults.length} unfiltered)\n\n${resultsString}`);
      return;
    }
    const bestResult = filtered[filtered.length - 1];
    sendMessage(
      ctx,
      `Found ${filtered.length} results (${
        rawResults.length
      } unfiltered)\nBest result: ${formatResult(bestResult)}`
    );
    retrieveFile(soulseek, ctx, bestResult, `${query}.mp3`);
  });
};

const main = async (soulseek) => {
  console.log("Starting...");
  const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
  bot.on("text", (ctx) => {
    const query = ctx.update.message.text.trim();
    onDownload(soulseek, ctx, query);
  });
  bot.launch();
};

(async () => {
  slsk.connect(
    {
      user: process.env.SLSK_USER,
      pass: process.env.SLSK_PASS,
    },
    async (err, client) => {
      await main(client);
    }
  );
})().catch((err) => {
  console.error(err);
});
