cradle-auditify
===============

Plugin for [cradle](https://github.com/flatiron/cradle) which provides a way make all changes in your CouchDB database
auditable.
Approach was inspired by [Tugdual Grall's post](http://blog.couchbase.com/how-implement-document-versioning-couchbase).

Features
------------
 - supports bulk operations
 - allows using separate database instance for audit docs
 - allows to easily implement user activity logging by storing audit metadata on audit docs
 - inherits Cradle's advantages
 - good test coverage

How it works
------------

Cradle-auditify extends original cradle ```Database``` instance with methods:
```auditableSave```, ```auditablePut```, ```auditablePost```, ```auditableRemove```, ```auditableMerge```

 Each of these methods internally calls original Cradle method (save, put, post, merge or remove) and also saves
 **audit document** which is just a copy of an original document but with another _id and containing metadata for
 auditing.

 For example we call ```database.auditablePost``` with document like this:

 ```
 {
    color: 'black'
 }
 ```

 So a new document will be saved into database:

 ```
    _id: "936caf5e007ee3570e50d7ab3b36b1df",
    _rev: "1-fcc4a130df1a91f981a80bed05e5d2ab",
    color: "black"
 ```

 And also **new audit document will be created in the database**:

 ```
    _id: "345ewghyy45007ee3570e50d7ab3b36c19f"
    _rev: "1-de8785f14dc07a79834771143fa0d908",
    color: 'black'
    a_metadata: {
        "timestampBefore": "2015-09-16T13:31:12.237Z",
        "timestampAfter": "2015-09-16T13:31:12.257Z",
        "originId": "936caf5e007ee3570e50d7ab3b36b1df"
    }
 ```

 Then we call ```database.auditablePut``` with changed color property:

  ```
     _id: "936caf5e007ee3570e50d7ab3b36b1df",
     _rev: "1-fcc4a130df1a91f981a80bed05e5d2ab",
     color: "red"
  ```

  This document will be updated as usual and also **new audit document will be created in the database**:


 ```
    _id: "56757fghf3570e50d7ab3b36e440"
    _rev: "1-a345df4dc07a79834771143fa0d908",
    color: 'red'
    a_metadata: {
        "timestampBefore": "2015-09-16T13:31:12.305Z",
        "timestampAfter": "2015-09-16T13:31:12.308Z",
        "originId": "936caf5e007ee3570e50d7ab3b36b1df"
    }
 ```

  Then we call ```database.auditableRemove``` for this document. Document will be removed from the database as
  usuall and also **new audit document will be created in the database**:

   ```
      _id: "6546ere50d7ab3b36e440"
      _rev: "1-34dgds4dc07a79834771143fa0d908",
      a_metadata: {
          "timestampBefore": "2015-09-16T13:31:12.355Z",
          "timestampAfter": "2015-09-16T13:31:12.361Z",
          "originId": "936caf5e007ee3570e50d7ab3b36b1df",
          "deleted": true
      }
   ```

   API
   ---
### Extending Cradle database ###

    ``` js
    var cradle = require('cradle');
    var cradleAuditify = require('cradle-auditify');

    var connection = new (cradle.Connection)('127.0.0.1', 5984, { cache: false });
    var db = connection.database('monkeys');
    db = cradleAuditify(db);
    ```

    ### auditableSave() ###
    A wrapper for original Cradle ```save``` method. Allows bulk operations just as original ```save```

    ``` js
    db.auditableSave(
    // New document to create/update
    {
        color: 'blue'
    },
    // Arbitrary audit matadata object. Will be added as embeded object to audit document. Nullable
    {
        endpoint: '/api/animals',
        method: 'POST',
        userId: 4234
    },
    function (err, res) {
    // Handle response
    });
    ```
    
    ### auditableMerge() ###
    A wrapper for original Cradle ```merge``` method.


    ``` js
    db.auditableMerge(
    // id of the document
    'sdf34523452sdfsafasdf23f',
    // document to merge
    {
        color: 'orange'
    },
    // Arbitrary audit matadata object. Will be added as embeded object to audit document. Nullable
    {
        endpoint: '/api/animals',
        method: 'POST',
        userId: 4234
    },
    function (err, res) {
    // Handle response
    });
    ```
