#include <stdio.h>
#include <stdlib.h>

int main(void) {
    const char *marker = getenv("FLOWLAB_TOOL_FAILURE_MARKER");
    if (marker && *marker) {
        FILE *file = fopen(marker, "a");
        if (file) {
            fputs("injected failure\n", file);
            fclose(file);
        }
    }
    return 23;
}
