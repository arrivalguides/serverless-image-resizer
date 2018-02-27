'use strict';

const AWS = require('aws-sdk');
const S3 = new AWS.S3({
  signatureVersion: 'v4',
});
const Sharp = require('sharp');
const Path = require("path");


const BUCKET_SOURCE = process.env.BUCKET_SOURCE;
const BUCKET_TARGET = process.env.BUCKET_TARGET;
const URL = process.env.URL;
const ALLOWED_DIMENSIONS = new Set();
const ALLOWED_EXTENSIONS = new Set();


if (process.env.ALLOWED_DIMENSIONS) {
  const dimensions = process.env.ALLOWED_DIMENSIONS.split(/\s*,\s*/);
  dimensions.forEach((dimension) => ALLOWED_DIMENSIONS.add(dimension));
}

if (process.env.ALLOWED_EXTENSIONS) {
  const extensions = process.env.ALLOWED_EXTENSIONS.split(/\s*,\s*/);
  extensions.forEach((extension) => ALLOWED_EXTENSIONS.add(extension));
}

exports.handler = function(event, context, callback) {
  const key = event.queryStringParameters.key;
  const match = key.match(/((\d+)x(\d+))\/(.*)/);
  const dimensions = match[1];
  const width = parseInt(match[2], 10);
  const height = parseInt(match[3], 10);
  const originalKey = match[4];
  const originalFilename = Path.basename(originalKey);
  const originalExtension = Path.extname(originalKey);

  
  if(ALLOWED_DIMENSIONS.size > 0 && !ALLOWED_DIMENSIONS.has(dimensions)) {
     callback(null, {
        statusCode: '403',
        headers: {},
        body: '',
    });
    return;
  }
  
    if(ALLOWED_EXTENSIONS.size > 0 && !ALLOWED_EXTENSIONS.has(originalExtension)) {
     callback(null, {
        statusCode: '403',
        headers: {},
        body: '',
    });
    return;
  }
  

  S3.getObject({
            Bucket: BUCKET_SOURCE,
            Key: originalKey
      }).promise().then(data => Sharp(data.Body)
            .resize(width, height)
//          .toFormat('png')
            .toBuffer()
    ).then(buffer => S3.putObject({
            Body: buffer,
            Bucket: BUCKET_TARGET,
            ContentType: buffer.ContentType,
            Key: key,
      }).promise()
    ).then(() => callback(null, {
            statusCode: '301',
            headers: {'location': `${URL}/${key}`},
            body: '',
      })
    ).catch(err => callback(err))
}
