import {defineConfig,devices} from '@playwright/test';
const databaseUrl=process.env.DATABASE_URL;
if(!databaseUrl || new URL(databaseUrl).pathname!=='/plutus_test') {
 throw new Error('Live browser E2E may only run against the dedicated plutus_test database');
}
export default defineConfig({
 testDir:'./e2e-live',timeout:45000,workers:1,
 use:{baseURL:'http://127.0.0.1:4174',trace:'retain-on-failure'},
 projects:[
  {name:'desktop',use:{...devices['Desktop Chrome']}},
  {name:'mobile',use:{...devices['iPhone 13'],browserName:'chromium'}}
 ],
 webServer:[
  {command:'node apps/api/dist/server.js',url:'http://127.0.0.1:3302/api/v1/health',reuseExistingServer:false,timeout:30000,env:{PORT:'3302',COOKIE_SECURE:'false',TRUST_PROXY:'false'}},
  {command:'npm run preview --workspace=@plutus/web -- --host 127.0.0.1 --port 4174',url:'http://127.0.0.1:4174',reuseExistingServer:false,timeout:30000}
 ],
 reporter:[['list']]
});
