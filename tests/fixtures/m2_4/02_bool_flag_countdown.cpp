#include <iostream>
using namespace std;

int stepCountdown(int remCount, bool isArmed) {
    int ticks = 0;
    if (!isArmed) {
        return -1;
    }
    while (remCount > 0) {
        if (isArmed) {
            ticks = ticks + 1;
        }
        remCount = remCount - 1;
        if (remCount == 0) {
            isArmed = false;
        }
    }
    if (isArmed == false) {
        return ticks;
    }
    return 0;
}

int main() {
    int out = stepCountdown(2, true);
    cout << out << endl;
    return 0;
}
