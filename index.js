const express = require("express");
const { exec, spawn } = require("child_process");
const { v4: uuidv4 } = require("uuid");
const fs = require('fs-extra');
const path = require("path");
const axios = require("axios");
const useragent = require("user-agent");

const app = express();
var appName, bundleId;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const port = 3000;
const tempDirPath = path.join(__dirname, "IPAs");
const certDirPath = path.join(__dirname, "cert");
const publicCertDirPath = path.join(__dirname, "public-cert");
app.use('/IPAs', express.static(tempDirPath));
app.use('/cert', express.static(certDirPath));
app.use('/public-cert', express.static(publicCertDirPath));

app.all("/", async (req, res) => {
  // Generate a random name for all files
  const newName = uuidv4();

  const ipa = req.query.ipa;
  const p12 = req.query.p12;
  const mp = req.query.mp;
  const pass = req.query.password;

  if (!ipa) {
    res.json({ status: 406, message: 'Please provide the "ipa" parameter.' });
  } else {
    const unsignedIpaPath = path.join(tempDirPath, newName + '_unsigned.ipa');
    const p12Path = path.join(certDirPath, newName + '.p12');
    const mpPath = path.join(certDirPath, newName + '.mobileprovision');

    try {
      // Download IPA file
      await downloadFile(ipa, unsignedIpaPath);
      console.log(`IPA file downloaded to: ${unsignedIpaPath}`);

      // Download P12 file if provided
      if (p12 !== 'cert/test.p12') {
        await downloadFile(p12, p12Path);
        console.log(`P12 file downloaded to: ${p12Path}`);
      }

      // Download MP file if provided
      if (mp !== 'cert/pufferXR.mobileprovision') {
        await downloadFile(mp, mpPath);
        console.log(`MP file downloaded to: ${mpPath}`);
      }

      // Perform signing process
      sign(unsignedIpaPath, p12 !== 'cert/test.p12' ? p12Path : null, mp !== 'cert/pufferXR.mobileprovision' ? mpPath : null, pass, (signError, result) => {
        if (signError) {
          res.json({ error: 'Signing Error', message: signError.message });
        } else {
          // Generate plist and redirect or serve download page
          const userAgent = req.headers['user-agent'];
          const userAgentParsed = useragent.parse(userAgent);
          const isIOSDevice = userAgentParsed.family === 'iOS';

          if (isIOSDevice) {
            const plistPath = generatePlist(req, result.signedIpaPath, newName, result.appName, result.bundleId, result.bundleVer);
            const itsmServiceLink = `itms-services://?action=download-manifest&url=https://sign.sideloadstore.me/${plistPath}`;
            console.log(itsmServiceLink);
            res.redirect(itsmServiceLink);
          } else {
            const plistPath = generatePlist(req, result.signedIpaPath, newName, result.appName, result.bundleId, result.bundleVer);
            const itsmServiceLink = `itms-services://?action=download-manifest&url=https://sign.sideloadstore.me/${plistPath}`;
            console.log(itsmServiceLink);
            res.redirect(itsmServiceLink);
          }
        }
      });
    } catch (error) {
      res.json({ error: 'Download Error', message: error.message });
    }
  }
});

function generatePlist(req, ipaPath, newName, appName, bundleId, bundleVer) {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0">
    <dict>
      <key>items</key>
      <array>
        <dict>
          <key>assets</key>
          <array>
            <dict>
              <key>kind</key>
              <string>software-package</string>
              <key>url</key>
              <string>${ipaPath.replace("/var/www/sideloadstore.me/signing-api/IPAs", "https://sign.sideloadstore.me/IPAs")}</string>
            </dict>
          </array>
          <key>metadata</key>
          <dict>
            <key>bundle-identifier</key>
            <string>${bundleId}</string>
            <key>bundle-version</key>
            <string>${bundleVer}</string>
            <key>kind</key>
            <string>software</string>
            <key>title</key>
            <string>${appName}</string>
          </dict>
        </dict>
      </array>
    </dict>
  </plist>`;

  const plistPath = path.join(tempDirPath, newName + '.plist');
  fs.writeFileSync(plistPath, plist);

  return plistPath.replace("/var/www/sideloadstore.me/signing-api/IPAs/", "IPAs/");
}

app.get('/download', (req, res) => {
  const ipaPath = req.query.ipa;
  res.download(ipaPath);
});

function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    axios({
      url,
      responseType: 'stream',
    })
      .then((response) => {
        const writer = fs.createWriteStream(destination);
        response.data.pipe(writer);
        writer.on('finish', () => {
          writer.close();
          resolve();
        });
      })
      .catch((error) => {
        reject(error);
      });
  });
}

function sign(ipaPath, p12Path, mpPath, password, callback) {
  const newName = uuidv4();
  const signedIpaPath = path.join(tempDirPath, newName + '.ipa');

  let command = 'zsign';

  let p12 = p12Path.replace("/var/www/sideloadstore.me/signing-api/cert/", "cert/");
  let mp = mpPath.replace("/var/www/sideloadstore.me/signing-api/cert/", "cert/");

  const args = [
    ipaPath.replace("/var/www/sideloadstore.me/signing-api/IPAs/", "IPAs/"),
    '-k', p12 || '',
    '-m', mp || '',
    '-p', password || '',
    '-o', signedIpaPath.replace("/var/www/sideloadstore.me/signing-api/IPAs/", "IPAs/")
  ];

  console.log(`Command to run: ${command} ${args.join(' ')}`);

  const signProcess = spawn(command, args);

  let stdoutData = '';

  signProcess.stdout.on("data", (data) => {
    stdoutData += data.toString();
    console.log(`${data}`);
  });

  signProcess.stderr.on("data", (data) => {
    console.error(`${data}`);
  });

  signProcess.on("close", (code) => {
    if (code === 0) {
      const appNameRegex = /AppName:\s+(.*)/;
      const bundleIdRegex = /BundleId:\s+(.*)/;
      const subjectCNRegex = /SubjectCN:\s+(.*)/;
      const bundleVerRegex = /BundleVer:\s+(.*)/;

      const appNameMatch = appNameRegex.exec(stdoutData);
      const bundleIdMatch = bundleIdRegex.exec(stdoutData);
      const subjectCNMatch = subjectCNRegex.exec(stdoutData);
      const bundleVerMatch = bundleVerRegex.exec(stdoutData);

      const appName = appNameMatch ? appNameMatch[1] : '';
      const bundleId = bundleIdMatch ? bundleIdMatch[1] : '';
      const subjectCN = subjectCNMatch ? subjectCNMatch[1] : '';
      const bundleVer = bundleVerMatch ? bundleVerMatch[1] : '';

      console.log(`AppName: ${appName}`);
      console.log(`BundleId: ${bundleId}`);
      console.log(`BundleVer: ${bundleVer}`);
      console.log(`SubjectCN: ${subjectCN}`);

      callback(null, { signedIpaPath, appName, bundleId, bundleVer });
    } else {
      callback(new Error("IPA signing failed, Maybe you entered the wrong password or the certificate might be revoked"));
    }
  });
}

const intervalInMinutes = 10;

function clean() {
  spawn('sudo', ['rm', 'IPAs/*']);
  spawn('sudo', ['rm', 'cert/*']);
  spawn('sudo', ['rm', '-rf', '/tmp/zsign*']);
}

app.listen(port, () => {
  clean();
  console.log(`Server running on port ${port}`);
  
  // Schedule clean() to run every 10 minutes
  setInterval(clean, intervalInMinutes * 60 * 1000);
});
