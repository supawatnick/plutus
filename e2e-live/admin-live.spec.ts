import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';

async function login(page:import('@playwright/test').Page,username:string){
 await page.goto('/');
 await page.getByLabel('USERNAME').fill(username);
 await page.getByLabel('PASSWORD').fill('integration-fixture-only');
 await page.getByRole('button',{name:/SIGN IN/}).click();
 await expect(page.getByRole('heading',{name:'Dashboard'})).toBeVisible();
}
async function navigate(page:import('@playwright/test').Page,mobile:boolean){
 if(mobile)await page.getByRole('button',{name:'Open menu'}).click();
 await page.getByRole('button',{name:/Administration/}).click();
}
test('admin manages IT account through real API and PostgreSQL',async({page},info)=>{
 await login(page,'api-test-admin');
 await navigate(page,info.project.name==='mobile');
 await expect(page.getByRole('heading',{name:'IT User Management'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Audit Trail'})).toBeVisible();
 const name='e2e-'+randomUUID().slice(0,12);
 await page.getByLabel('USERNAME').fill(name);
 await page.getByLabel(/TEMPORARY PASSWORD/).fill('e2e-fixture-password-only');
 await page.getByRole('button',{name:'CREATE IT USER'}).click();
 const account=page.locator('.admin-user').filter({hasText:name});
 await expect(account).toBeVisible();
 await expect(account).toContainText('ACTIVE');
 await account.getByRole('button',{name:'DISABLE'}).click();
 await expect(account).toContainText('INACTIVE');
 await account.getByRole('button',{name:'ENABLE'}).click();
 await expect(account).toContainText('ACTIVE');
});
test('viewer cannot access administration from mobile or desktop',async({page},info)=>{
 await login(page,'api-test-viewer');
 if(info.project.name==='mobile')await page.getByRole('button',{name:'Open menu'}).click();
 await expect(page.getByRole('button',{name:/Administration/})).toHaveCount(0);
 const response=await page.request.get('/api/v1/users');
 expect(response.status()).toBe(403);
});
