import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';

// Real browser -> API -> PostgreSQL. No mocked responses or test-table cleanup.
// The isolated plutus_test database must first be seeded by npm run test:api.
test('signed-in inventory create, checkout, return on live database',async({page},info)=>{
 await page.route('**/api/v1/**',async route=>{
  const original=route.request();
  const url=new URL(original.url());
  const upstream='http://127.0.0.1:3302'+url.pathname+url.search;
  const response=await route.fetch({url:upstream,headers:{...original.headers(),origin:'http://127.0.0.1:3302',host:'127.0.0.1:3302'}});
  await route.fulfill({response});
 });
 await page.goto('/');
 await page.getByLabel('USERNAME').fill('api-test-manager');
 await page.getByLabel('PASSWORD').fill('integration-fixture-only');
 await page.getByRole('button',{name:/SIGN IN/}).click();
 await expect(page.getByRole('heading',{name:'Dashboard'})).toBeVisible();
 const mobile=info.project.name==='mobile';
 async function navigate(name:string){
  if(mobile)await page.getByRole('button',{name:'Open menu'}).click();
  await page.getByRole('button',{name:new RegExp(name)}).click();
 }
 await navigate('Inventory');
 const assetName='Live E2E '+randomUUID().slice(0,8);
 await page.getByRole('button',{name:'NEW ASSET'}).click();
 const form=page.getByRole('dialog',{name:'Create asset'});
 await form.getByLabel('ASSET NAME').fill(assetName);
 await form.getByLabel('SERIAL NUMBER (OPTIONAL)').fill('LIVE-'+randomUUID());
 await form.getByLabel('LOCATION').fill('Test Shelf');
 await form.getByRole('button',{name:'CREATE ASSET'}).click();
 await expect(page.getByRole('row').filter({hasText:assetName})).toBeVisible();
 await navigate('Borrow / Return');
 const assetOption=page.getByRole('combobox',{name:'ASSET'}).locator('option').filter({hasText:assetName});
 const assetId=await assetOption.getAttribute('value');
 expect(assetId).toBeTruthy();
 await page.getByRole('combobox',{name:'ASSET'}).selectOption(assetId!);
 await page.getByLabel('BORROWER NAME').fill('Live E2E Borrower');
 await page.getByLabel('BORROWER EMAIL').fill('e2e@example.invalid');
 await page.getByLabel('CUSTOMER NAME').fill('Test Customer');
 await page.getByLabel('CUSTOMER SITE').fill('Test Site');
 await page.getByLabel('PROJECT').fill('Live E2E');
 await page.getByRole('button',{name:/CHECK OUT/}).click();
 const loanRow=page.locator('.loan-row').filter({hasText:assetName}).filter({hasText:'Live E2E Borrower'});
 await expect(loanRow).toBeVisible();
 await loanRow.getByRole('button',{name:'RETURN',exact:true}).click();
 const returnDialog=page.getByRole('dialog',{name:'Check in asset'});
 await returnDialog.getByLabel('NEW LOCATION').fill('Returned Test Shelf');
 await returnDialog.getByRole('button',{name:'CONFIRM RETURN'}).click();
 await expect(page.locator('.loan-row').filter({hasText:assetName}).filter({hasText:'CLOSED'})).toBeVisible();
 if(mobile){
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
 }
});
