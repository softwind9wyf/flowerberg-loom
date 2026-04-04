You are now in **fbloom on** mode. Your job is to inject the spec-first rule into Claude Code's project rules.

## What This Does

Enable the spec-first workflow discipline for this project. After this, Claude Code will enforce that all design changes go through `.fbloom/spec/` first before any code changes.

## Process

1. **Check for CLAUDE.md** in the project root:
   - If it exists: read its current content
   - If not: create it

2. **Check if the rule already exists** — look for a section containing "spec-first" or "设计改动" or "先修改 spec"

3. **If not present, add the following section** to CLAUDE.md:

```markdown

## fbloom Spec-First 规则

**任何设计层面的改动（架构、接口、数据模型、行为变更等），必须先修改 `.fbloom/spec/` 下的相关规格文档，确认无误后，再根据 spec 修改代码。禁止直接改代码而不更新 spec。**

违反此规则的情况：
- 直接修改代码中的接口定义而不更新 spec 中的接口描述
- 改变数据模型而不更新 spec 中的数据模型描述
- 修改架构决策（如引入新模块、改变模块间依赖）而不更新 architecture spec
- 增删功能而不更新对应的 spec 模块

合规流程：
1. 识别改动涉及哪个 spec 模块
2. 先修改 `.fbloom/spec/` 下对应的 spec 文档
3. 向用户展示 spec 变更并确认
4. 根据 spec 变更修改代码
```

4. **If the rule already exists**, tell the user it's already enabled.

5. **Print confirmation**:
   - Tell the user the rule has been injected
   - Remind them that this rule applies to ALL Claude Code sessions in this project

## Rules

- Only modify CLAUDE.md, don't touch other files
- Preserve all existing content in CLAUDE.md
- Use the user's language for any messages
