---
"@asenajs/asena": patch
---

Fix WebSocket cleanup and unsubscribe mechanism

- Fixed topic format inconsistency in subscribe/unsubscribe calls
- Improved AsenaSocket cleanup to avoid modification during iteration
- Enhanced unsubscribe method with safer filtering approach
- Added comprehensive test coverage for memory leak prevention and topic format consistency

