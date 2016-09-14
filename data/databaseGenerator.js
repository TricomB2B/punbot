'use strict';

/**
 * Generate the database and tables.
 * It's smart enough to not overwrite pre-existing tables.
 * Unlike you.
 */

var path   = require('path'),
    sqlite = require('sqlite3').verbose();

var outputFile = process.argv[2] || path.resolve(__dirname, 'punbot.db');
var db         = new sqlite.Database(outputFile);

// Prepares the database connection in serialized mode
db.serialize();
// Creates the database structure
db.run('CREATE TABLE IF NOT EXISTS punpoints (user TEXT PRIMARY KEY, points INTEGER DEFAULT 0, given INTEGER DEFAULT 0)');
db.run('CREATE TABLE IF NOT EXISTS info (name TEXT PRIMARY KEY, val TEXT DEFAULT NULL)');
// all done
db.close();
