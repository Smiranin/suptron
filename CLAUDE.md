## Development Philosophy & Rules

### Mandatory Workflow: Design Before Implementation

**CRITICAL: Never jump straight to implementation. Always follow this sequence:**

#### 1. Problem Analysis Phase

When asked for a bug fix, new feature, or code change — **first analyze and understand:**

- What is the actual problem?
- What is the root cause?
- What are the constraints and requirements?

**Present analysis clearly and wait for confirmation before proceeding.**

#### 2. Design Phase

After problem analysis is confirmed, propose solutions:

**Always provide 2-3 solution options:**

- Option 1: [Approach A] — pros, cons, trade-offs
- Option 2: [Approach B] — pros, cons, trade-offs
- Option 3: [Approach C] — pros, cons, trade-offs (if applicable)

**Recommendation:** Clearly state which option you recommend and why.
**WAIT for approval before moving to implementation.**

#### 3. Implementation Phase

Only after design is approved:

- Analyze existing code patterns in the project
- Follow those patterns in implementation
- Present the implementation plan
- Wait for final approval before applying changes

### Anti-Patterns: What NOT to Do

**Never propose workarounds or "quick fixes" as the only solution:**

- No hardcoded values instead of proper configuration
- No monkey patching or overriding library internals
- No global state without justification
- No copy-pasted code instead of proper abstraction
- No ignoring errors or empty catch blocks
- No magic numbers/strings without named constants
- No "TODO: fix this later" in production code

A quick workaround may be **one of the options** (never the only one) if clearly labeled as "Quick workaround (not recommended)" with trade-offs explained.

### Code Quality Standards

**Error Handling:** Handle errors explicitly with meaningful messages. Never silently swallow exceptions.

**Code Patterns:** Analyze the existing codebase first. Follow established patterns. Maintain consistency with surrounding code.

**Code Duplication:** Avoid repeating code. Extract common logic. Apply DRY principle.

**Documentation:** Document "why" not "what". Add comments for non-obvious decisions. Use JSDoc where appropriate.

**Readability:** Descriptive names, focused functions, clarity over cleverness.

### Iterative Refinement

If feedback suggests the approach needs adjustment:

- Don't immediately implement a different solution
- First revise the design based on feedback
- Present updated design options
- Wait for approval before implementing

**Quality and correctness are more important than speed.**
