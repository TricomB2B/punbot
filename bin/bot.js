'use strict';

/**
 * Main entry point for the bot application.
 */

var PunBot = require('../lib/punbot');

var token  = process.env.PUN_BOT_API_KEY;
var dbPath = process.env.PUN_BOT_DB_PATH;
var name   = process.env.PUN_BOT_NAME;

var punbot = new PunBot({
  token: token,
  dbPath: dbPath,
  name: name
});

punbot.run();
