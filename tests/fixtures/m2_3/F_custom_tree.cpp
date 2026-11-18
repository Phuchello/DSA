#include <iostream>
using namespace std;

struct BinNode {
    int key;
    BinNode* lPtr;
    BinNode* rPtr;
};

int sumKeys(BinNode* cur) {
    if (cur == nullptr) return 0;
    return cur->key + sumKeys(cur->lPtr) + sumKeys(cur->rPtr);
}

int main() {
    BinNode* leftChild = new BinNode{5, nullptr, nullptr};
    BinNode* rightChild = new BinNode{15, nullptr, nullptr};
    BinNode* root = new BinNode{10, leftChild, rightChild};

    int total = sumKeys(root);
    cout << total << endl;

    delete leftChild;
    delete rightChild;
    delete root;
    return 0;
}
