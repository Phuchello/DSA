#include <iostream>
using namespace std;

int findFirstOccurrence(int seq[], int n, int needle) {
    int low = 0;
    int high = n - 1;
    int firstOccurrence = -1;
    while (low <= high) {
        int midPoint = low + (high - low) / 2;
        if (seq[midPoint] == needle) {
            firstOccurrence = midPoint;
            high = midPoint - 1;
        } else if (seq[midPoint] < needle) {
            low = midPoint + 1;
        } else {
            high = midPoint - 1;
        }
    }
    return firstOccurrence;
}

int main() {
    int seq[6] = {2, 5, 5, 5, 8, 12};
    int foundIdx = findFirstOccurrence(seq, 6, 5);
    int missingIdx = findFirstOccurrence(seq, 6, 7);
    cout << foundIdx << " " << missingIdx << endl;
    return 0;
}
