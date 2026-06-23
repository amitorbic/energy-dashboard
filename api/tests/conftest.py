"""
Test configuration for api/tests/.

Sets the Windows event-loop policy before pytest-asyncio creates any loops.
aiomysql (and the underlying asyncio-based MySQL driver) does not support
Windows' default ProactorEventLoop — it requires SelectorEventLoop.
Without this, any aiomysql operation on Windows raises:
  NotImplementedError (on ProactorEventLoop) or
  "Task got Future pending attached to a different loop"
"""

import sys
import asyncio

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
