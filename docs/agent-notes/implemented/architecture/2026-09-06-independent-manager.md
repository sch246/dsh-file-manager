# Independent manager ownership

Manager owns directory browsing, tree state, directory polling and mutations. User-files owns Session path resolution, metadata/content access and serialized text/byte publication. Viewer owns the filesystem source and resource polling. These owners can be installed independently; cooperation does not require another UI feature.

Manager file rows send canonical paths and placement intent to the common Host opener. Its directory listener resolves shared metadata, delegates files with `next()`, and retains resolution errors. No viewer import, resource descriptor, source registration or content endpoint remains in manager. Sidebar instance IDs, restore descriptors and browser preference keys retain their existing values.

The shared-provider install helper checks compatible API ranges from actual consumer manifests, reuses one installed provider, and otherwise joins it to the consumer's plugin transaction. Consumer removal retains shared services. Configuration migration preserves complete effective rows as specified in STATE. Host receipt transfer and managed activation remain separate operations.
