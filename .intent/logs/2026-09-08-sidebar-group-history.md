# Shared group history

The manager retained a private directory stack after sidebar group history was introduced. Workspace capture intercepted its shortcuts before its old local handlers, while manager never registered a group replay callback or reported destinations. Removed that stack and its panel handlers; successful navigation reports a sidebar checkpoint and creation/restoration registers onNavigate. Initial listing supplies the first destination; history replay restores the saved directory, expansion, filter and selection without adding another entry. Failed or superseded directory loads veto replay. Manager retains focus in its stable panel before a directory row is replaced. Sidebar focuses stable group chrome before each history command so consecutive shortcuts remain captured across tab changes.

Owned builds are the selected validation; no tests or browser automation were run, as requested. Activation evidence is recorded in the local maintenance receipt.
