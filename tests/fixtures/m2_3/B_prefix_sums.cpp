#include <iostream>
using namespace std;

int main() {
    int rawVals[5] = {3, 1, 4, 1, 5};
    int cumSum[6] = {0, 0, 0, 0, 0, 0};
    for (int i = 1; i <= 5; ++i) {
        cumSum[i] = cumSum[i - 1] + rawVals[i - 1];
    }
    int fullSum = cumSum[5] - cumSum[0];
    int singleSum = cumSum[3] - cumSum[2];
    cout << fullSum << " " << singleSum << endl;
    return 0;
}
