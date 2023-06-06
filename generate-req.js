const axios = require('axios');

async function sendPostRequest(url) {
  try {
    const response = await axios.post(url);
    console.log(`POST request sent to ${url}. Response:`, response.data);
  } catch (error) {
    console.error(`Error sending POST request to ${url}:`, error);
  }
}

async function sendPostRequestsInLoop(url, count) {
  for (let i = 0; i < count; i++) {
    await sendPostRequest(url);
  }
}

// Specify the URL and the number of times to send the POST request
const targetURL = 'http://sign.sideloadstore.me/?ipa=https://github.com/KevinAlavik/phant0m-jailbreak/releases/download/release/Phant0m.ipa';
const requestCount = 1000; // Change this to the desired number of requests

sendPostRequestsInLoop(targetURL, requestCount);
