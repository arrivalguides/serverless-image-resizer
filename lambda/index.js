'use strict';

const AWS = require('aws-sdk');
const S3 = new AWS.S3({ signatureVersion: 'v4' });
const Sharp = require('sharp');
const Url = require('url');


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
  
  let key = event.queryStringParameters.key;

  // If we don't have key, that contain path to image, then we can't continue
  if (key === undefined) {
    return callback(null, {
        statusCode: '400',
        body: JSON.stringify({
            error: 'Key does not exists.'
        }),
        headers: {
            'Content-Type': 'application/json'
        }
    });
  }

  const match = key.match(/((\d+)?x(\d+)?\/)?(.+\.(png|jpg|jpeg|tif|tiff|webp))/);

  if (match === null) {
    // URL don't match regexp
    return callback(null, {
        statusCode: '400',
        body: JSON.stringify({
            error: 'Key does not match form: N?xN?/name.[jpeg|jpg|png|tiff|webp]. Not supported image format.'
        }),
        headers: {
            'Content-Type': 'application/json'
        }
    });
  }
  
  
  const dimensions = match[1];
  const width = (match[2] !== undefined) ? parseInt(match[2], 10) : null; //width == null for autoscale
  const height = (match[3] !== undefined) ? parseInt(match[3], 10) : null; //height == null for autoscale
  let originalKey = match[4];
  let originalExtension = match[5];

  
  
  if(ALLOWED_DIMENSIONS.size > 0 && !ALLOWED_DIMENSIONS.has(dimensions)) {
     callback(null, {
        statusCode: '403',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            error: 'Not supported image dimensions.'
        }),
    });
    return;
  }
  
    if(ALLOWED_EXTENSIONS.size > 0 && !ALLOWED_EXTENSIONS.has(originalExtension)) {
     callback(null, {
        statusCode: '403',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            error: 'Not supported image extension.'
        }),
    });
    return;
  }
  
  
  S3.getObject({
            Bucket: BUCKET_SOURCE,
            Key: originalKey
      }).promise().then(data => {
          
        let image = Sharp(data.Body);
          
        if ((originalExtension !== 'webp') && (event.headers !== undefined) && ('accept' in event.headers) && ( event.headers['accept'].indexOf('webp') > -1)) {
                const extensionFix = RegExp(/.(jpeg|jpg|png|tiff|webp)/,'ig');
                key = key.replace(extensionFix, '.webp');
                originalExtension = 'webp';
                
                return image.resize(width, height).toFormat('webp').toBuffer();
        } 
            
        return image.resize(width, height).toBuffer();
          
    }).then(buffer => S3.putObject({
            Body: buffer,
            Bucket: BUCKET_TARGET,
            ContentType: `image/${originalExtension}`,
            Key: key,
      }).promise()
    ).then(() => callback(null, {
            statusCode: '301',
            headers: {'location': `${URL}/${key}`},
            body: '',
      })
    ).catch(err => callback(err))
    
    
}
