#include <iostream>
using namespace std;

int computeInner(int* targetPtr) {
    int val = *targetPtr * 2;
    *targetPtr = val + 1;
    return val;
}

int processOuter(int val) {
    int* ptr = &val;
    int res = computeInner(ptr);
    return res + val;
}

int main() {
    int val = 5;
    int result = processOuter(val);
    cout << val << " " << result << endl;
    return 0;
}
