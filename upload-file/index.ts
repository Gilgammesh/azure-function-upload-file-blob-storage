import { AzureFunction, Context, HttpRequest } from '@azure/functions';
import HTTP_CODES from 'http-status-enum';
import * as multipart from 'parse-multipart';
import { generateReadOnlySASUrl } from './azure-storage-blob-sas-url';

const httpTrigger: AzureFunction = async (context: Context, req: HttpRequest): Promise<any> => {
  context.log('upload HTTP trigger function processed a request.');
  
  // Replace with DefaultAzureCredential before moving to production
  const storageConnectionString = process.env.AzureWebJobsStorage;
  if (!storageConnectionString) {
    context.res.body = `AzureWebJobsStorage env var is not defined - get Storage Connection string from Azure portal`;
    context.res.status = HTTP_CODES.BAD_REQUEST;
  }

  // User name is the container name
  const containerName = req.query?.username;
  if (!containerName) {
    context.res.body = `username is not defined`;
    context.res.status = HTTP_CODES.BAD_REQUEST;
  }

  // `filename` is required property to use multi-part npm package
  const fileName = req.query?.filename;
  if (!fileName) {
    context.res.body = `filename is not defined`;
    context.res.status = HTTP_CODES.BAD_REQUEST;
  }

  // file content must be passed in as body
  if (!req.body || !req.body.length) {
    context.res.body = `Request body is not defined`;
    context.res.status = HTTP_CODES.BAD_REQUEST;
  }

  // Content type is required to know how to parse multi-part form
  if (!req.headers || !req.headers['content-type']) {
    context.res.body = `Content type is not sent in header 'content-type'`;
    context.res.status = HTTP_CODES.BAD_REQUEST;
  }

  context.log(
    `*** Username:${req.query?.username}, Filename:${req.query?.filename}, Content type:${req.headers['content-type']}, Length:${req.body.length}`
  );

  try {
    const userName = req.query?.username;
    const fileName = req.query?.filename;
    const containerName = userName;

    // Each chunk of the file is delimited by a special string
    const bodyBuffer = Buffer.from(req.body);
    const boundary = multipart.getBoundary(req.headers['content-type']);
    const parts = multipart.Parse(bodyBuffer, boundary);

    // The file buffer is corrupted or incomplete ?
    if (!parts?.length) {
      context.res.body = `File buffer is incorrect`;
      context.res.status = HTTP_CODES.BAD_REQUEST;
    }

    // filename is a required property of the parse-multipart package
    if (parts[0]?.filename) console.log(`Original filename = ${parts[0]?.filename}`);
    if (parts[0]?.type) console.log(`Content type = ${parts[0]?.type}`);
    if (parts[0]?.data?.length) console.log(`Size = ${parts[0]?.data?.length}`);

    // Passed to Storage
    context.bindings.storage = parts[0]?.data;

    // Get SAS token
    const sasInfo = await generateReadOnlySASUrl(process.env.AzureWebJobsStorage, containerName, fileName);

    // Returned to requestor
    context.res.body = {
      fileName,
      storageAccountName: sasInfo.storageAccountName,
      containerName,
      url: sasInfo.accountSasTokenUrl
    };
  } catch (err) {
    context.log.error(err.message);
    context.res.body = { error: `${err.message}` };
    context.res.status = HTTP_CODES.INTERNAL_SERVER_ERROR;
  }

  return context.res;
};

export default httpTrigger;
