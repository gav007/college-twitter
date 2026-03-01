require('dotenv').config();

const app = require('./app');
const { startMediaCleanupLoop } = require('./services/tweetMedia');

const port = Number(process.env.PORT) || 3000;

startMediaCleanupLoop();

app.listen(port, () => {
  console.log(`Loopfeed listening on port ${port}`);
});
