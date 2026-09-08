# 统一导航修复

用户在审查后授权直接修复并删除多余测试，要求不运行测试、不做浏览器自动化、不创建 worktree。审查依据是实际源码与用户交互要求；任务审查记录位于本机 `/root/dsh-navigation-review.md`。

目录解析、目录读取及历史恢复承接同一个 sidebar navigation 的取消信号；先准备树快照，成功 commit 后才更新历史。失败或取消保留旧目录，清理加载状态并恢复轮询，新 operation 不被旧任务覆盖。移除 sourceInstanceId 等于 tree id 时绕过普通导航的特殊分支。保留一个 Session 树，复用已有树的实际分组；新树遵循目标位置。

删除 history.client.spec.ts：其断言针对已移除的 manager 私有历史 API 和快捷键路径，与组统一维护历史的职责冲突。未删除文件操作与数据保护测试。manager 版本 0.1.3，要求 sidebar >=0.0.5 <0.1.0、user-files ^0.1.9，不增加 viewer 依赖。

验证采用受影响包的 owned build（包含源码类型编译）；不运行测试或浏览器交互。实际构建、激活与发布结果由本机维护 receipt 记录。编译成功不代表交互验收，连续历史快捷键和迟到结果焦点行为仍需人工观察。
