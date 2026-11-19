const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dir = 'C:/Users/lyle3/AppData/Local/Temp/flowlab-feat-m2-3/tests/fixtures/m2_3';
const outDir = 'C:/Users/lyle3/AppData/Local/Temp/flowlab_m2_3_eval_bin';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const tests = [
  { file: 'A_binary_search.cpp', expected: '1 -1' },
  { file: 'B_prefix_sums.cpp', expected: '14 4' },
  { file: 'C_euclidean_gcd.cpp', expected: '6 6' },
  { file: 'D_monotonic_stack.cpp', expected: '5 10 10 -1 -1' },
  { file: 'E_merge_sort.cpp', expected: '3 27 38 43' },
  { file: 'F_custom_tree.cpp', expected: '30' },
  { file: 'G_dp_numeric.cpp', expected: '2' },
  { file: 'H_shadow_pointers.cpp', expected: '5 21' },
  { file: 'N1_step_limit.cpp', expected: '2000' }
];

console.log('=== VERIFYING INDEPENDENT REFERENCE COMPILATION & STDOUT ===');
for (const t of tests) {
  const src = path.join(dir, t.file);
  const exe = path.join(outDir, t.file.replace('.cpp', '.exe'));
  execSync(`g++ -std=c++17 -O0 "${src}" -o "${exe}"`);
  const stdout = execSync(`"${exe}"`).toString().trim();
  const pass = stdout === t.expected;
  console.log(`${t.file.padEnd(25)} expected="${t.expected}" actual="${stdout}" => ${pass ? 'PASS' : 'FAIL'}`);
}

console.log('\n=== VERIFYING N2 (COMPILE ERROR) ===');
try {
  execSync(`g++ -std=c++17 -O0 "${path.join(dir, 'N2_compile_error.cpp')}" -o "${path.join(outDir, 'N2.exe')}"`, { stdio: 'pipe' });
  console.log('N2_compile_error.cpp => UNEXPECTED PASS');
} catch (e) {
  console.log('N2_compile_error.cpp => COMPILE ERROR AS EXPECTED');
}
