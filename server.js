require('dotenv').config();

const app = require('./app');
const { startNewsBotLoop } = require('./services/newsBots');
const { startMediaCleanupLoop } = require('./services/tweetMedia');

const port = Number(process.env.PORT) || 3000;

startMediaCleanupLoop();
startNewsBotLoop();

app.listen(port, () => {
  console.log(`Loopfeed listening on port ${port}`);
});
