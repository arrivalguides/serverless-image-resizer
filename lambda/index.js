'use strict';

const AWS = require('aws-sdk');
const S3 = new AWS.S3({ signatureVersion: 'v4' });
const Sharp = require('sharp');
const Url = require('url');


const BUCKET = process.env.BUCKET;
// const BUCKET_TARGET = process.env.BUCKET_TARGET;
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

  const match = key.match(/((\d+)x?(\d+)?\/)?(.+\.(png|jpg|jpeg|tif|tiff|webp))/);

  if (match === null) {
    // URL don't match regexp
    return callback(null, {
        statusCode: '400',
        body: JSON.stringify({
            error: 'Key does not match form: Nx?N?/name.[jpeg|jpg|png|tiff|webp]. Not supported image format.'
        }),
        headers: {
            'Content-Type': 'application/json'
        }
    });
  }
  
  
  const dimensions = match[1];
  const width = parseInt(match[2], 10);
  const height = parseInt(match[3], 10);
  const originalKey = match[4];
  const originalExtension = match[5];

  
  
  if(ALLOWED_DIMENSIONS.size > 0 && !ALLOWED_DIMENSIONS.has(dimensions)) {
     callback(null, {
        statusCode: '403',
        headers: {
            'Content-Type': 'application/json'
        }
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
        }
        body: JSON.stringify({
            error: 'Not supported image extension.'
        }),
    });
    return;
  }
  
  const supportWebP = (event.headers.Accept.indexOf('webp') > -1);
  const parsedURL = Url.parse(event.queryStringParameters.key, true, true);
  
  // If browser support webp — redirect to webp
  if (supportWebP && originalExtension !== 'webp') {
    const extensionFix = RegExp(/.(jpeg|jpg|png|tiff|webp)/,'ig');
    key = key.replace(extensionFix, '.webp');
  }
  

  // Let get metadata by key
  S3.headObject({Bucket: BUCKET, Key: originalKey}, function(err, data) {

    if (err) {
      // Can't find this file
      return callback(null, {
        statusCode: '404',
        body: JSON.stringify({
            error: 'Key does not exists.'
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    
    S3.getObject({Bucket: BUCKET, Key: originalKey}).promise().then((data) => {
      let image = Sharp(data.Body);
      return image.metadata().then((metadata) => {

        // Let's calculate image size
        // 0 minimal
        // 5000 maximal
        // But no upscale
        // Aspect ratio maintained
        let width = parsedURL.query.width ? parsedURL.query.width : (match[2] === undefined) ? metadata.width : parseInt(match[2], 10);
        let height = parsedURL.query.height ? parsedURL.query.height : (match[3] === undefined) ? null : parseInt(match[3], 10);

        let isHeight = (height !== null);
        let ratio = isHeight ? width / height : metadata.width / metadata.height;
        let targetWidth = Math.floor(Math.max(0, Math.min(Math.min(parseInt(width, 10), metadata.width), 5000)));
        let targetHeight = Math.floor(Math.max(0, Math.min(targetWidth / ratio, 5000)));

        if (supportWebP) {
          return image
            .resize(targetWidth, targetHeight)
            .crop(Sharp.gravity.north)
            .webp({
                quality: 90,
                force: true
            })
            .toBuffer();
        }
        
        return image
          .resize(targetWidth, targetHeight)
          .crop(Sharp.gravity.north)
          .jpeg({
                quality: 90, 
                chromaSubsampling: '4:4:4'
          })
          .toBuffer();

      });
    }).then(buffer => S3.putObject({
      Body: buffer,
      Bucket: BUCKET,
      ContentType: supportWebP ? 'image/webp' : 'image/jpeg',
      Key: key,
      Tagging: "resized=true"
    }).promise()).then(() => callback(null, {
      statusCode: '301',
      headers: {
        'location': `${URL}/${key}`
      },
      body: ''
    })).catch(err => callback(err));
  });
    
    
}
