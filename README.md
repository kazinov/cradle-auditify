cradle-auditify
===============

Plugin for [cradle](https://github.com/flatiron/cradle) which provides a way make all changes in your CouchDB database
auditable.
Approach was inspired by [Tugdual Grall post](http://blog.couchbase.com/how-implement-document-versioning-couchbase).

How it works
------------

Cradle-auditify extends original cradle ```Database``` instance with methods:
 - auditableSave
 - auditablePut
 - auditablePost
 - auditableMerge
 - auditableRemove

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