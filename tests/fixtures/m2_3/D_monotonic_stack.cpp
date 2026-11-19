#include <iostream>
#include <vector>
using namespace std;

int main() {
    vector<int> heights = {4, 5, 2, 10, 8};
    int n = heights.size();
    vector<int> nge(n, -1);
    vector<int> stk;
    for (int i = 0; i < n; ++i) {
        while (!stk.empty() && heights[stk.back()] < heights[i]) {
            nge[stk.back()] = heights[i];
            stk.pop_back();
        }
        stk.push_back(i);
    }
    for (int i = 0; i < n; ++i) {
        cout << nge[i] << (i == n - 1 ? "" : " ");
    }
    cout << endl;
    return 0;
}
