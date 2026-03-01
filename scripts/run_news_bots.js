require('dotenv').config();

const { runNewsBotsOnce } = require('../services/newsBots');

runNewsBotsOnce()
  .then((result) => {
    console.log(`BOT_POSTS_CREATED=${result.created}`);
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
