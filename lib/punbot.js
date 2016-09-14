'use strict';

/**
 * PunBot Class
 * Extends the slackbots class to create the pun scoring bot
 */

var util   = require('util'),
    path   = require('path'),
    fs     = require('fs'),
    extend = require('extend'),
    sqlite = require('sqlite3').verbose(),
    Bot    = require('slackbots');

/**
 * Constructs our class with optional settings
 * settings: {
 *   name: alternate name for the bot (defaults to punbot),
 *   dbPath: alternate path for the database (defaults to /data/punbot.db)
 * }
 */
var PunBot = function Constructor(settings) {
  this.settings      = settings;
  this.settings.name = this.settings.name || 'punbot';
  this.dbPath        = settings.dbPath || path.resolve(process.cwd(), 'data', 'punbot.db');

  this.user = null;  // user info object for the bot
  this.db   = null;  // database object
};

// inherit methods and properties from the Bot constructor
util.inherits(PunBot, Bot);

/**
 * Add a reaction from punbot to indicate it tallied the pun point request
 * @param {string} id     Channel ID
 * @param {string} emoji  Emoji to react with
 * @param {string} ts     Timestamp of the message to react to
 * @param {object} params Optional params to attach to the reaction
 */
PunBot.prototype.postReactionToChannel = function (id, emoji, ts, params) {
  params = extend({
    channel: id,
    name: emoji,
    timestamp: ts,
  }, params || {});

  return this._api('reactions.add', params);
};

/**
 * Sets up the bot, calling the parent constructor and activating listeners
 */
PunBot.prototype.run = function () {
  PunBot.super_.call(this, this.settings);

  this.on('start', this._onStart);
  this.on('message', this._onMessage);
};

/**
 * Open up the connection to the database
 */
PunBot.prototype._connectDb = function () {
  if (!fs.existsSync(this.dbPath)) {
      console.error('Database path ' + '"' + this.dbPath + '" does not exists or it\'s not readable.');
      process.exit(1);
  }

  this.db = new sqlite.Database(this.dbPath);
};

/**
 * Check if it's our first run and if so post up the welcome message
 */
PunBot.prototype._firstRunCheck = function () {
  var self = this;

  self.db.get('SELECT val FROM info WHERE name = "lastrun" LIMIT 1', function (err, record) {
    if (err)
      return console.error('DATABASE ERROR:', err);

    var currentTime = (new Date()).toJSON();

    // this is a first run
    if (!record) {
        self._welcomeMessage();
        return self.db.run('INSERT INTO info(name, val) VALUES("lastrun", ?)', currentTime);
    }

    // updates with new last running time
    self.db.run('UPDATE info SET val = ? WHERE name = "lastrun"', currentTime);
  });
};

/**
 * Record that the given user ID gave a pun point
 */
PunBot.prototype._gavePoint = function (id) {
  var self = this,
      user = this.users.filter(function (user) {
        return user.id === id;
      })[0].name;

  self.db.get('SELECT given FROM punpoints WHERE user = ? LIMIT 1', user, function (err, record) {
    if (err)
      return console.error('DATABASE ERROR:', err);

    // this is their first point
    if (!record)
      return self.db.run('INSERT INTO punpoints(user, given) VALUES(?, ?)', user, 1);

    // updates with new last running time
    self.db.run('UPDATE punpoints SET given = ? WHERE user = ?', record.given + 1, user);
  });
};

/**
 * Give the given user ID a pun point
 */
PunBot.prototype._givePoint = function (id) {
  var self = this,
      user = this.users.filter(function (user) {
        return user.id === id;
      })[0].name;

  self.db.get('SELECT points FROM punpoints WHERE user = ? LIMIT 1', user, function (err, record) {
    if (err)
      return console.error('DATABASE ERROR:', err);

    // this is their first point
    if (!record)
      return self.db.run('INSERT INTO punpoints(user, points) VALUES(?, ?)', user, 1);

    // updates with new last running time
    self.db.run('UPDATE punpoints SET points = ? WHERE user = ?', record.points + 1, user);
  });
};

/**
 * Return true if it's a regular chat message
 */
PunBot.prototype._isChatMessage = function (message) {
  return message.type === 'message' && Boolean(message.text);
};

/**
 * Return true if the message was posted by punbot
 */
PunBot.prototype._isFromPunBot = function (message) {
  return message.user === this.user.id;
};

/**
 * Parse message text and return true if it's a proper pun point request
 */
PunBot.prototype._isPunPoint = function (message) {
  return /@(.*)\s+pun\spoint/.test(message.text.toLowerCase());
};

/**
 * Return true if the message is a valid scores request
 */
PunBot.prototype._isScoreRequest = function (message) {
  var long  = '<@'+this.user.id+'>\\stell\\sme\\swhat\\sthe\\sdang\\sscores\\sare\?\?',
      short = '<@'+this.user.id+'>\\s+scores';

  var longRegEx  = new RegExp(long, 'i'),
      shortRegEx = new RegExp(short, 'i');

  return longRegEx.test(message.text) || shortRegEx.test(message.text);
};

/**
 * Get the bot's user info
 */
PunBot.prototype._loadBotUser = function () {
  var self = this;
  this.user = this.users.filter(function (user) {
      return user.name === self.name;
  })[0];
};

/**
 * Listen and parse all messages posted to any channel to determine if we should take action
 */
PunBot.prototype._onMessage = function (message) {
  // don't do anything if the message is from @punbot
  // or if it is not a chat message
  if (this._isFromPunBot(message) ||
      !this._isChatMessage(message))
    return;

  // pun point request ('@whomever pun point')
  if (this._isPunPoint(message)) {
    // do nothing if it's directed to a non-user
    if(!/<@(.*)>/.test(message.text))
      return;

    var reciever = message.text.match(/<@(.*)>/)[1];

    // trying to give points to self
    if (message.user === reciever) {
      this._rejectionMessage(message.user);
      return;
    }

    // handle the pun point action
    this._givePoint(reciever);
    this._gavePoint(message.user);
    this.postReactionToChannel(message.channel, 'thumbsup', message.ts, {as_user: true});

  // score request ('@punbot scores')
  } else if (this._isScoreRequest(message)) {
    this._scoresMessage(message.channel);

  }
};

/**
 * Bot set up
 */
PunBot.prototype._onStart = function () {
  this._loadBotUser();
  this._connectDb();
  this._firstRunCheck();
};

/**
 * Post a message to the user ID if it's an invalid pun point request
 */
PunBot.prototype._rejectionMessage = function (id) {
  this.postMessage(id, 'Like Africa, Kenya not try to give yourself points?',
    {as_user: true});
};

/**
 * Output the scores to the same channel the request was made from
 */
PunBot.prototype._scoresMessage = function (channel) {
  var self = this,
      msg  = '';

  self.db.all('SELECT * FROM punpoints', function (err, records) {
    if (err)
      return console.error('DATABASE ERROR:', err);

    for (var i = 0; i < records.length; i++) {
      msg += '*' + records[i].user + '*: ' + records[i].points + '\n';
    }

    self.postMessage(channel, msg, {as_user:true});
  });
};

/**
 * Output the welcome message (with bot instructions) to the general channel
 */
PunBot.prototype._welcomeMessage = function () {
  this.postMessageToChannel('general', 'Hi I keep track of pun points.' +
      '\n Give a point by typing `@whomever pun point`.' +
      '\n I can also spit out the scores: `@' + this.name + ' tell me what the dang scores are??`' +
      '\n Or just `@' + this.name + ' scores`' +
      '\n Bye now.',
    {as_user: true});
};

module.exports = PunBot;
