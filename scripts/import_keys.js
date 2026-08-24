const fs = require('fs');
const path = require('path');

const keysDir = path.join(__dirname, '..', 'keys');
const envPath = path.join(__dirname, '..', '.env');
const devVarsPath = path.join(__dirname, '..', '.dev.vars');
const wranglerPath = path.join(__dirname, '..', 'wrangler.jsonc');

async function importKeys() {
  console.log('Reading Service Account JSON files from:', keysDir);
  const files = fs.readdirSync(keysDir).filter(f => f.endsWith('.json'));
  
  if (files.length === 0) {
    console.log('No JSON files found in keys directory.');
    return;
  }

  const serviceAccounts = [];

  for (const file of files) {
    const filePath = path.join(keysDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const json = JSON.parse(content);
      if (json.client_email && (json.private_key || json.privateKey)) {
        serviceAccounts.push({
          email: json.client_email || json.email,
          privateKey: json.private_key || json.privateKey
        });
        console.log(`Successfully parsed: ${file}`);
      } else {
        console.warn(`WARNING: Missing client_email or private_key in ${file}`);
      }
    } catch (err) {
      console.error(`Failed to parse ${file}:`, err.message);
    }
  }

  console.log(`\nTotal valid Service Accounts found: ${serviceAccounts.length}`);

  const saJsonString = JSON.stringify(serviceAccounts);
  // Prepare for .env and .dev.vars
  const envReadyStr = `SERVICE_ACCOUNTS_JSON='${saJsonString}'`;

  // Function to process .env and .dev.vars
  const updateEnvFile = (filePath, fileName) => {
    if (!fs.existsSync(filePath)) {
      console.log(`${fileName} not found. Skipping.`);
      return;
    }
    
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // Remove individual GOOGLE_SA lines
    content = content.replace(/^GOOGLE_SA\d+[\s\S]*?(?=^[\w]+=|$)/gm, '');
    
    // Remove if SERVICE_ACCOUNTS_JSON already exists
    content = content.replace(/^SERVICE_ACCOUNTS_JSON=[\s\S]*?(?=^[\w]+=|$)/gm, '');

    // Clean up empty lines
    content = content.replace(/\n\s*\n/g, '\n\n');

    // Append new variable
    content = content.trim() + '\n\n' + envReadyStr + '\n';
    
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Updated ${fileName}`);
  };

  updateEnvFile(envPath, '.env');
  updateEnvFile(devVarsPath, '.dev.vars');

  // Update wrangler.jsonc carefully
  if (fs.existsSync(wranglerPath)) {
    let wranglerContent = fs.readFileSync(wranglerPath, 'utf-8');
    
    // We will parse it and rewrite it. Wrangler files are typically valid JSONC.
    // For safety, we will use JSON.parse assuming it doesn't have active comments, 
    // or we'll inject using regex string replacement in the vars block.
    
    // We already cleaned wrangler.jsonc previously. Let's use JSON.parse.
    try {
      const jsonc = JSON.parse(wranglerContent);
      if (!jsonc.vars) jsonc.vars = {};
      
      // Delete old variables if they exist
      for (let i = 1; i <= 20; i++) {
        delete jsonc.vars[`GOOGLE_SA${i}`];
      }
      
      // Inject new array
      jsonc.vars.SERVICE_ACCOUNTS_JSON = saJsonString;
      
      fs.writeFileSync(wranglerPath, JSON.stringify(jsonc, null, 2), 'utf-8');
      console.log('Updated wrangler.jsonc');
    } catch (parseError) {
      console.error('Error parsing wrangler.jsonc. Ensure it contains valid JSON (without comments) or update it manually.', parseError.message);
    }
  }

  console.log('\nBulk Import Complete!');
}

importKeys();
