var _ = require('lodash'),
    events = require('events');

/**
 *  @default
 */
var defaultOptions = {
    originIdFieldName: 'originId',
    timestampBeforeFieldName: 'timestampBefore',
    timestampAfterFieldName: 'timestampAfter',
    deletedFieldName: 'deleted',
    attachmentsFieldName: 'attachments',
    auditMetadataFieldName: 'a_metadata',
    typeFieldName: 'type',
    originTypeFieldName: 'originType',
    auditType: 'audit',
    database: null
};

function auditableSave(doc, auditMetadata, callback) {
    var that = this;
    auditMetadata = initializeAuditMetadata(auditMetadata, this.auditOptions);

    that.save(doc, function (err, res) {
        return that._auditCallbackHandler(err, res, doc, auditMetadata, callback);
    });
}

function auditableMerge(/* [id], doc, auditMetadata */) {
    var that = this;
    var args = Array.prototype.slice.call(arguments),
        callback = args.pop(),
        auditMetadata = args.pop(),
        doc = args.pop(),
        id = args.pop() || doc._id;

    auditMetadata = initializeAuditMetadata(auditMetadata, this.auditOptions);

    this.merge(id, doc, function (err, res) {
        return that._auditCallbackHandler(err, res, doc, auditMetadata, callback);
    });
}

function auditablePut(id, doc, auditMetadata, callback) {
    var that = this;
    auditMetadata = initializeAuditMetadata(auditMetadata, this.auditOptions);

    that.put(id, doc, function (err, res) {
        return that._auditCallbackHandler(err, res, doc, auditMetadata, callback);
    });
}

function auditablePost(doc, auditMetadata, callback) {
    var that = this;
    auditMetadata = initializeAuditMetadata(auditMetadata, this.auditOptions);

    that.post(doc, function (err, res) {
        return that._auditCallbackHandler(err, res, doc, auditMetadata, callback);
    });
}

function auditableRemove(id, rev, auditMetadata, callback) {
    var that = this;
    auditMetadata = initializeAuditMetadata(auditMetadata, this.auditOptions);

    that.remove(id, rev, function (err, res) {
        var doc = {
            _id: id,
            _rev: rev,
            _deleted: true
        };
        return that._auditCallbackHandler(err, res, doc, auditMetadata, callback);
    });
}

function _archive(doc, auditMetadata) {
    var auditDocument = createAuditDocument(doc, auditMetadata, this.auditOptions);
    this.auditOptions.database.save(auditDocument, this._onArchived.bind(this));
}

function _onArchived (err, res) {
    if (err) {
        return this.auditEvents.emit('error', err);
    }
    this.auditEvents.emit('archived', res);
}

function _auditCallbackHandler(err, res, doc, auditMetadata, callback) {
    if (err) {
        return callback(err);
    }

    var docToArchive = mergeSaveResultToDoc(doc, res);
    this._archive(docToArchive, auditMetadata);
    return callback(null, res);
}

function initializeAuditMetadata(auditMetadata, options){
    auditMetadata = auditMetadata || {};
    setTimestamp(auditMetadata, options.timestampBeforeFieldName);
    return auditMetadata;
}

function setTimestamp(obj, field) {
    obj[field] = new Date().toISOString();
}

function mergeSaveResultToDoc(doc, saveResult) {
    if (Array.isArray(doc) && Array.isArray(saveResult) && doc.length === saveResult.length) {
        saveResult.forEach(function (item, i) {
            setId(doc[i], item);
        });
        return doc;
    } else if (!Array.isArray(doc) && !Array.isArray(saveResult)) {
        setId(doc, saveResult);
        return doc;
    }

    function setId(doc, res) {
        doc._id = res.id;
    }
    throw new Error('Unexpected parameters');
}

function createAuditDocument(doc, auditMetadata, options) {
    auditMetadata = auditMetadata || {};
    setTimestamp(auditMetadata, options.timestampAfterFieldName);

    if (Array.isArray(doc)) {
        return doc.map(function (item) {
            return transform(item);
        });
    } else {
        return transform(doc);
    }

    function transform(doc) {
        if (!doc._id) {
            throw new Error('Can not create audit document without originId');
        }

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
        } else {
            auditMetadataForDoc[options.deletedFieldName] = undefined;
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
}

/**
 * extends cradle database instance with
 * auditableSave, auditableRemove, auditablePut, auditablePost, auditableMerge methods.
 *  @param db @see cradle.Database instance to extend
 *  @param {object} options Audit options object. For @default @see defaultOptions
 */
module.exports = function (db, options) {
    db.auditOptions = {};
    _.assign(db.auditOptions, defaultOptions);
    _.assign(db.auditOptions, options);
    db.auditOptions.database = db.auditOptions.database || db;

    /**
     * Emits archived and error events
     * @type {events.EventEmitter}
     */
    db.auditEvents = new events.EventEmitter();

    /**
     * @param {object | array of objects} doc Document to be saved
     * @param {object} auditMetadata document to be embeded to audit copy, nullable
     * @param {function} callback
     * */
    db.auditableSave = auditableSave;

    /**
     *  @param {string} id
     * @param {string} rev
     * @param {object} auditMetadata document to be embeded to audit copy, nullable
     * @param {function} callback
     * */
    db.auditablePut = auditablePut;

    /**
     * @param {object} doc Document to be posted
     * @param {object} auditMetadata document to be embeded to audit copy, nullable
     * @param {function} callback
     * */
    db.auditablePost = auditablePost;

    /**
     *  @param {string} id, optional
     * @param {object} doc, doc to be merged
     * @param {object} auditMetadata document to be embeded to audit copy, nullable
     * @param {function} callback
     * */
    db.auditableMerge = auditableMerge;


    /**
     * @param {string} id _id field of deleting document
     * @param {string} rev _rev field of deleting document
     * @param {object} auditMetadata document to be embeded to audit copy, nullable
     * @param {function} callback
     * */
    db.auditableRemove = auditableRemove;

    db._archive = _archive;
    db._onArchived = _onArchived;
    db._auditCallbackHandler = _auditCallbackHandler;

    return db;
};

module.exports.mergeSaveResultToDoc = mergeSaveResultToDoc;
module.exports.createAuditDocument = createAuditDocument;