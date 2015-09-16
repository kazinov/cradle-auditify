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

/** Save doc or array of docs and audit copies.
 * Callback is being invoked as soon as save operation ended.
 * Audit copies saving goes on in background
 * @param {object} doc Document to be saved
 * @param {object} auditMetadata document to be embeded to audit copy, optional */
function auditableSave(doc, auditMetadata, callback) {
    var that = this;
    auditMetadata = auditMetadata || {};
    auditMetadata[this.auditOptions.timestampBeforeFieldName] = new Date().toISOString();

    that.save(doc, function (err, res) {
        if (err) {
            return callback(err);
        }

        var docToArchive = mergeSaveResultToDoc(doc, res);
        that._archive(docToArchive, auditMetadata);

        return callback(null, res);
    });
};

/** Remove doc and save audit copy.
 * Callback is being invoked as soon as remove operation ended.
 * Audit copies saving goes on in background.
 * @param {string} id _id field of deleting document
 * @param {string} rev _rev field of deleting document
 * @param {object} auditMetadata document to be embeded to audit copy, optional */
function auditableRemove(id, rev, auditMetadata, callback) {
    var that = this;
    auditMetadata = auditMetadata || {};

    var docToArchive = {
        _id: id,
        _rev: rev,
        _deleted: true
    };
    auditMetadata[this.auditOptions.timestampBeforeFieldName] = new Date().toISOString();

    that.remove(id, rev, function (err, res) {
        if (err) {
            return callback(err);
        }

        that._archive(docToArchive, auditMetadata);
        return callback(null, res);
    });
};

function _archive(doc, auditMetadata) {
    var auditDocument = createAuditDocument(doc, auditMetadata, this.auditOptions);
    this.save(auditDocument, this._onArchived.bind(this));
};

function _onArchived (err, res) {
    if (err) {
        return this.auditEvents.emit('error', err);
    }
    this.auditEvents.emit('archived', res);
};

function mergeSaveResultToDoc(doc, saveResult) {
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

function createAuditDocument(doc, auditMetadata, options) {
    auditMetadata = auditMetadata || {};
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
            auditMetadataForDoc = _.assign({}, auditMetadata),
            deleted = doc._deleted || false;

        if (deleted) {
            // don't copy fields on deleted document audit.
            audit = {};
        } else {
            audit = _.assign({}, doc);
        }

        if (deleted) {
            auditMetadataForDoc[options.deletedFieldName] = deleted;
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


/**
 * extends cradle database instance with auditableSave, auditableRemove methods.
 *  @param db @see cradle.Database instance to extend
 *  @param {object} options Audit options object. For @default @see defaultOptions
 */
module.exports = function (db, options) {
    db.auditOptions = {};
    _.assign(db.auditOptions, defaultOptions);
    _.assign(db.auditOptions, options);

    db.auditEvents = new events.EventEmitter();
    db.auditableSave = auditableSave;
    db.auditableRemove = auditableRemove;
    db._archive = _archive;
    db._onArchived = _onArchived;

    return db;
};

module.exports.mergeSaveResultToDoc = mergeSaveResultToDoc;
module.exports.createAuditDocument = createAuditDocument;