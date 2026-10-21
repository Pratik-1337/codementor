const res = await fetch('http://localhost:3001/problem.html');
const text = await res.text();
console.log('Run code button hidden with display: none:', text.includes('id="runCodeBtn" class="btn-run" style="display: none;"'));
console.log('Submit button visible:', text.includes('id="submitBtn" class="btn-submit"'));
