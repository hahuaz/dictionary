export function uriModifier(event: any, _context: any, callback: any) {
  // console.log("event", JSON.stringify(event, null, 2));

  const { request, _config } = event.Records[0].cf;

  if (!request.uri.includes(".")) {
    // Add ".html" to the end of the URI
    request.uri += ".html";
    // console.log('modified request', JSON.stringify(request, null, 2));
  }

  return callback(null, request);
}
