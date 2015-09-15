var AuditableDatabase = require('./AuditableDatabase');

module.exports = function (databaseName, connection) {
    return new AuditableDatabase(databaseName, connection);
};