#include <iostream>
using namespace std;

int main() {
    int target = 5;
    int coins[3] = {1, 2, 3};
    int dp[6] = {0, 99, 99, 99, 99, 99};

    for (int amt = 1; amt <= target; ++amt) {
        for (int i = 0; i < 3; ++i) {
            int coinVal = coins[i];
            if (amt - coinVal >= 0 && dp[amt - coinVal] + 1 < dp[amt]) {
                dp[amt] = dp[amt - coinVal] + 1;
            }
        }
    }

    cout << dp[target] << endl;
    return 0;
}
