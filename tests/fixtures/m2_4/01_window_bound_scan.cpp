#include <iostream>
using namespace std;

int clampProbe(int loBound, int hiBound, int probeVal) {
    if (loBound > hiBound) {
        return -1;
    }
    while (loBound < hiBound) {
        if (probeVal == loBound) {
            return loBound;
        } else if (probeVal < hiBound && loBound >= 0) {
            loBound = loBound + 1;
        } else {
            hiBound = hiBound - 1;
        }
    }
    return loBound;
}

int main() {
    int loBound = 10;
    int hiBound = 2;
    int found = clampProbe(1, 2, 2);
    cout << found << " " << loBound << " " << hiBound << endl;
    return 0;
}
