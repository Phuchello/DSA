#include <iostream>
using namespace std;

int gcdIterative(int alpha, int beta) {
    while (beta != 0) {
        int remainder = alpha % beta;
        alpha = beta;
        beta = remainder;
    }
    return alpha;
}

int gcdRecursive(int u, int v) {
    if (v == 0) {
        return u;
    }
    return gcdRecursive(v, u % v);
}

int main() {
    int resIter = gcdIterative(48, 18);
    int resRec = gcdRecursive(54, 24);
    cout << resIter << " " << resRec << endl;
    return 0;
}
