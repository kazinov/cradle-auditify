var cradle = require('cradle'),
    util = require('util'),
    _ = require('lodash'),
    events = require('events');

/**
 *  @default
 */
var defaultOptions = {
    originIdFieldName: 'a_originId',
    timestampBeforeFieldName: 'a_timestampBefore',
    timestampAfterFieldName: 'a_timestampAfter',
    deletedFieldName: 'a_deleted',
    attachmentsFieldName: 'a_attachments',
    auditMetadataFieldName: 'a_metadata',
    typeFieldName: 'type',
    originTypeFieldName: 'a_originType',
    auditType: 'audit'
};

/**
 * Creates a new AuditableDatabase.
 * @class
 *  @param name @see cradle.Database class params
 *  @param connection @see cradle.Database class params
 *  @param {object} options Audit options object. For @default @see defaultOptions
 *  Has the following fields:
 *   {string} originIdFieldName - originId field name on an audit document,
 *   {string} timestampFieldName - timestamp field name on an audit document,
 *   {string} deletedFieldName - deleted field name on an audit document,
 *   {string} typeFieldName - type field name on an original doc to add the postfix,
 *   {string} auditType - type constant to be added on a audit document field defined by
 *   typeFieldName option,
 *   {boolean} timestampOnLiveDoc - flag which indicates should the timestamp field be
 *   put on a live doc or on a audit doc,
 */
var AuditableDatabase = function (name, connection, options) {
    this.auditOptions = {};
    _.assign(this.auditOptions, defaultOptions);
    _.assign(this.auditOptions, options);

    this.auditEvents = new events.EventEmitter();
    cradle.Database.call(this, name, connection);
};

util.inherits(AuditableDatabase, cradle.Database);

/** Save doc or array of docs and audit copies.
 * Callback is being invoked as soon as save operation ended.
 * Audit copies saving goes on in background
 * @param {object} doc Document to be saved
 * @param {object} auditMetadata document to be embeded to audit copy, optional */
AuditableDatabase.prototype.auditableSave = function (doc, auditMetadata, callback) {
    var that = this;
    auditMetadata = auditMetadata || {};
    auditMetadata[this.auditOptions.timestampBeforeFieldName] = new Date().toISOString();

    that.save(doc, function (err, res) {
        if (err) {
            return callback(err);
        }

        var auditDoc = AuditableDatabase.mergeSaveResultToDoc(doc, res);
        that._archive(auditDoc, auditMetadata);

        return callback(null, res);
    });
};

/** Remove doc and save audit copy.
 * Callback is being invoked as soon as remove operation ended.
 * Audit copies saving goes on in background.
 * @param {string} id _id field of deleting document
 * @param {string} rev _rev field of deleting document
 * @param {object} auditMetadata document to be embeded to audit copy, optional */
AuditableDatabase.prototype.auditableRemove = function (id, rev, auditMetadata, callback) {
    var that = this;
    auditMetadata = auditMetadata || {};

    var auditDoc = {
        _id: id,
        _rev: rev
    };
    auditMetadata[this.auditOptions.timestampBeforeFieldName] = new Date().toISOString();
    auditMetadata[this.auditOptions.deletedFieldName] = true;

    that.remove(id, rev, function (err, res) {
        if (err) {
            return callback(err);
        }

        that._archive(auditDoc, auditMetadata);
        return callback(null, res);
    });
};

AuditableDatabase.prototype._archive = function(doc, auditMetadata) {
    var auditDocument = AuditableDatabase.createAuditDocument(doc, auditMetadata, this.auditOptions);
    this.save(auditDocument, this._onArchived.bind(this));
};

AuditableDatabase.prototype._onArchived = function(err, res) {
    if (err) {
        return this.auditEvents.emit('error', err);
    }
    this.auditEvents.emit('archived', res);
};

AuditableDatabase.mergeSaveResultToDoc = function (doc, saveResult) {
    if (Array.isArray(doc) && Array.isArray(saveResult) && doc.length === saveResult.length) {
        saveResult.forEach(function (item, i) {
            doc[i]._id = item.id;
        });
        return doc;
    } else if (!Array.isArray(doc) && !Array.isArray(saveResult)) {
        doc._id = saveResult.id;
        return doc;
    }

    throw new Error('Unexpected parameters');
};

AuditableDatabase.createAuditDocument = function (doc, auditMetadata, options) {
    auditMetadata = auditMetadata || {};
    var deleteOperation = auditMetadata[options.deletedFieldName] || false;
    auditMetadata[options.timestampAfterFieldName] = new Date().toISOString();

    if (Array.isArray(doc)) {
        return doc.map(function (item) {
            return transform(item);
        });
    } else {
        return transform(doc);
    }

    function transform(doc) {
        var audit,
            auditMetadataForDoc = _.assign({}, auditMetadata);

        if(doc._deleted) {
            // CouchDb provides a way to do bulk update by setting _deleted to true on bulk operation
            // https://wiki.apache.org/couchdb/HTTP_Bulk_Document_API
            deleteOperation = true;
        }

        if (deleteOperation) {
            // don't copy fields on deleted document audit.
            audit = {};
        } else {
            audit = _.assign({}, doc);
        }

        if (deleteOperation) {
            auditMetadataForDoc[options.deletedFieldName] = deleteOperation;
        }

        if (audit._attachments) {
            // current solution is not to store attached documents with
            // the audit copies, only attachments metadata
            auditMetadataForDoc[options.attachmentsFieldName] = audit._attachments;
            audit._attachments = undefined;
        }

        auditMetadataForDoc[options.originIdFieldName] = doc._id;
        if (options.auditType) {
            auditMetadataForDoc[options.originTypeFieldName] = audit[options.typeFieldName];
            audit[options.typeFieldName] = options.auditType;
        }

        audit[options.auditMetadataFieldName] = auditMetadataForDoc;
        audit._id = audit._rev = undefined;

        return audit;
    }
};

module.exports = AuditableDatabase;


