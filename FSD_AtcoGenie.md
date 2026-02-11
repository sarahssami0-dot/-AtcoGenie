# Functional Specification Document
## AtcoGenie - AI-Powered Conversational Analytics Platform

**Version:** V1.0  
**Document Purpose:** This document defines the functional scope, module behavior, data models, and technical constraints for AtcoGenie Version 1. It specifies what is included in the initial release and explicitly excludes features reserved for future iterations.

---

## 1. System Overview

AtcoGenie is an enterprise-grade conversational analytics platform that enables authorized users to interact with organizational data through natural language queries. The system integrates with multiple disparate enterprise systems (Softronics ERP, SAP, HCMS, Active Directory) and provides secure, attribute-based access to data while maintaining the native security boundaries of each source system.

**Core Utility:**
- Natural language querying across fragmented enterprise data sources
- Real-time authentication and identity synchronization from Active Directory and HCMS
- Secure data retrieval with automatic enforcement of hierarchical access controls based on organizational position
- Multi-turn conversational context with persistent chat history
- Partial failure handling for high availability

---

## 2. Access Control Model

### 2.1 Attribute-Based Access Control (ABAC)

AtcoGenie does not use predefined application roles. Instead, access is determined dynamically based on organizational attributes synchronized from source systems:

**Key Attributes:**
- **Department/Division:** Determines lateral data visibility boundaries
- **Manager Hierarchy:** Defines vertical visibility (managers see their reports' data)
- **Employee Type:** Differentiates between regular staff, contractors, executives
- **Payroll Group:** Inherited from People Partner for salary and payroll data access
- **Source System Permissions:** Native security models from Pharma Pulse, People Partner, SAP are preserved

### 2.2 Access Enforcement Rules

**Behavior Rules:**
- User attributes are **automatically synchronized** from HCMS, AD, and ERP systems. There is no manual attribute assignment in AtcoGenie.
- Access decisions are made **at query time** by evaluating the user's attributes against the requested data's security context.
- **Hierarchical visibility:** Managers (identified via reporting hierarchy) can access data for all direct and indirect reports.
- **Department boundaries:** Users can only view data within their assigned department unless explicitly granted cross-department access in the source system.
- **Self-service data:** All authenticated users can view their own attendance, payroll, leave, and profile information.
- Attribute changes in source systems reflect in AtcoGenie within **15 minutes** (sync interval).
- Terminated employees are **auto-deprovisioned** within the same sync window.

**Zero-Trust Principle:**
Even if a user explicitly requests unauthorized data via natural language (e.g., "Show me the CEO's salary"), the query engine filters results to match their organizational position and permissions.

---

## 3. Core Functional Modules

### Module 1: Authentication & Identity Management

**Description:**  
Handles user authentication via Windows Authentication (Kerberos/NTLM) and synchronizes identity attributes from Active Directory and HCMS.

**Key Capabilities:**
- Single Sign-On (SSO) using corporate Active Directory credentials
- Automatic user profile creation on first login
- Bi-directional sync with HCMS for department, designation, and reporting hierarchy
- Service Principal Name (SPN) support for domain-joined clients
- Session management with configurable timeout (default: 30 minutes idle)

**Behavior Rules:**
- If a user exists in AD but not in HCMS, access is **denied** until HCMS sync completes.
- Users accessing from non-domain machines receive a **credential prompt** (no auto-authentication).
- Identity sync runs every **15 minutes**. Manual refresh is not available in V1.
- User attributes cached locally for performance; cache invalidates on organizational change detection.

**Out of Scope (V1):**
- Multi-Factor Authentication (MFA)
- OAuth2/SAML for external identity providers
- Self-service profile editing

---

### Module 2: Organizational Hierarchy & Identity Mapping

**Description:**  
Maintains a canonical representation of the organization's structure, mapping AD accounts to employee records and tracking departmental hierarchy.

**Key Capabilities:**
- Centralized **Identity Mapping Database (IMD)** linking AD usernames to Employee IDs
- Department, Division, and Team hierarchy representation
- Manager-reportee relationship tracking (direct and indirect)
- Historical tracking of department transfers and designation changes
- Integration with source system security models (Payroll Groups, Teams, Roles from ERP)

**Behavior Rules:**
- The IMD is the **single source of truth** for identity resolution across all modules.
- If an AD account cannot be mapped to an Employee ID, the user is classified as "Unknown" and granted minimal access (own data only).
- Department hierarchy is represented as a **tree structure** with unlimited depth.
- When a user changes departments, their historical records remain associated with the previous department for audit purposes.
- Manager hierarchy is determined by the "Reports To" field in HCMS. Changes propagate to AtcoGenie within 15 minutes.

**Out of Scope (V1):**
- Organization chart visualization
- Custom organizational tags or labels
- Matrix reporting structures (multiple managers)

---

### Module 3: Conversational Interface (Query Management)

**Description:**  
The core chat interface where users submit natural language queries and receive AI-generated responses grounded in organizational data.

**Key Capabilities:**
- Web-based chat UI with real-time message streaming
- Multi-turn conversation context (the system remembers previous queries in a session)
- Markdown rendering with rich formatting (tables, code blocks, lists)
- Inline "Copy Table" buttons for easy data export
- Query history search across all user sessions

**Behavior Rules:**
- Each chat **session** is isolated. Context is maintained within a session but does not carry over to new sessions.
- Messages are stored in **Chat History Database** immediately upon send.
- If the AI cannot generate a confident response, it returns: *"I don't have enough information to answer this accurately. Please refine your query."*
- Tables are rendered with copy-to-clipboard functionality (preserves formatting for Excel/Word).
- Users can **archive**, **rename**, or **delete** sessions. Deleted sessions move to a soft-delete state (recoverable for 30 days).

**Out of Scope (V1):**
- Voice input/output
- Multi-user collaboration in a single session
- Query templates or saved prompts
- Export to PDF

---

### Module 4: Data Orchestration & Integration

**Description:**  
The brain of AtcoGenie. Routes natural language queries to appropriate data sources, enforces security, merges results, and handles partial failures.

**Key Capabilities:**
- Dynamic query routing to Softronics ERP (Pharma Pulse, People Partner), SAP, and HCMS
- Automatic security filter injection based on user's organizational attributes
- Parallel data fetching from multiple sources
- Partial failure graceful degradation (returns available data with warning)
- Query result caching for performance (5-minute TTL)
- Preservation of native source system security models (Roles in Pharma Pulse, Payroll Groups in People Partner, SAP authorization objects)

**Behavior Rules:**
- The orchestrator **never executes raw SQL** generated by the AI. All queries are parameterized and validated.
- If a data source is unreachable, the system proceeds with available sources and appends a warning: *"Note: SAP data unavailable."*
- Security filters are applied **at the database level** before data is returned to the AI. The AI never sees unauthorized data.
- Cross-system queries (e.g., "Employee attendance from People Partner + project allocations from Pharma Pulse") are merged by **Employee ID** as the primary key.
- When querying systems with native security models (e.g., Pharma Pulse Roles), AtcoGenie respects those permissions and does not override them.

**Out of Scope (V1):**
- Real-time data streaming from sources
- User-defined custom data connectors
- GraphQL endpoint support
- Scheduled/automated queries

---

### Module 5: Chat History & Collaboration

**Description:**  
Manages persistent storage of user conversations, enabling search, archival, and session management.

**Key Capabilities:**
- Persistent chat history stored per user
- Full-text search across message content and metadata
- Archive/Unarchive chat sessions
- Session rename for organization
- Automatic session titling (AI-generated summary of first message)

**Behavior Rules:**
- Chat history is **user-scoped**. Users cannot view other users' chats (privacy by design).
- Archived sessions are hidden from the default view but remain searchable.
- Search results are sorted by **last activity timestamp** (most recent first).
- Deleted sessions are **soft-deleted** and retained in the database for 30 days before permanent purge.

**Out of Scope (V1):**
- Shared/team chat sessions
- Commenting on specific messages
- Session export to external formats
- Chat analytics dashboard

---

### Module 6: Audit & Data Safety

**Description:**  
Tracks all user actions and data access events for compliance and security monitoring.

**Key Capabilities:**
- Comprehensive audit logging of all queries and data retrievals
- User action logs (login, logout, session delete, archive)
- Failed authentication attempt tracking
- Query performance metrics logging
- Data access tracking by source system

**Behavior Rules:**
- Every query is logged with: **username, timestamp, query text, data sources accessed, result row count, user's organizational attributes at query time**.
- Audit logs are **immutable**. Once written, they cannot be modified or deleted (write-once).
- Logs are retained for **2 years** per compliance requirements.
- Sensitive fields (e.g., passwords, tokens) are **redacted** from audit logs.
- If a user's organizational position changes (e.g., promotion to manager), audit logs preserve the **historical context** of what their permissions were at the time of each query.

**Out of Scope (V1):**
- Real-time alerting on suspicious activity
- Audit log export to SIEM systems
- User activity dashboards
- GDPR "right to be forgotten" automated workflow

---

## 4. Non-Functional Requirements

### 4.1 Performance
- **Query Response Time:** 95th percentile < 3 seconds for single-source queries
- **Multi-Source Queries:** 95th percentile < 5 seconds (parallel fetching)
- **Concurrent Users:** System must support 100+ simultaneous users without degradation
- **Chat History Load Time:** < 500ms for retrieval of last 50 sessions

### 4.2 Security
- **Transport Security:** All communication over TLS 1.2+ (HTTPS enforced)
- **Authentication:** Windows Authentication (Kerberos/NTLM)
- **Data Encryption at Rest:** Chat history and audit logs encrypted using AES-256
- **Input Sanitization:** All user inputs sanitized to prevent SQL Injection and Prompt Injection
- **Secrets Management:** Database credentials and API keys stored in secure vault (not in config files)
- **Source System Security Preservation:** Native permissions from Pharma Pulse, People Partner, and SAP are never bypassed

### 4.3 Scalability
- **Data Model:** Schema supports up to 500,000 employees without refactoring
- **Message Storage:** Supports 10 million+ messages with indexed search
- **Horizontal Scaling:** Application layer stateless; can scale horizontally behind load balancer

### 4.4 Availability
- **Uptime Target:** 99.5% during business hours (8 AM - 6 PM)
- **Partial Failure Tolerance:** System remains operational if 1 out of 3 data sources is down
- **Graceful Degradation:** If AI service is unavailable, system shows cached results with warning

---

## 5. Problem Statement & Current Gaps

### 5.1 Current System Landscape

The organization currently operates multiple enterprise systems, each with its own distinct security architecture, all controlled at the application level:

#### **Softronics ERP Platform**
The primary enterprise resource planning system that houses two major applications:

1. **Pharma Pulse**
   - **Security Model:** Role-based and Team-based security
   - **Access Control:** Users are assigned specific Roles and Teams, which determine their data visibility and permissible actions within the application.

2. **People Partner**
   - **Security Model:** Payroll Group-based security
   - **Sub-Applications:**
     - **HR Application:** Restricted exclusively to HR team members.
     - **ESS (Employee Self-Service):** Accessible to all employees for personal functions such as:
       - Attendance tracking
       - Leave applications
       - Performance appraisals
       - Payroll information access

#### **Centralized Security Provisioning**
All Softronics ERP systems are managed through a centralized **"Security" application** that controls the provisioning of Form-level rights and access permissions across the platform.

#### **SAP**
The organization also utilizes SAP as a core enterprise system. AtcoGenie will integrate with SAP to provide unified access to its data alongside other organizational systems.

### 5.2 The Challenge

**We do not currently have a streamlined process for fetching data securely across these systems in a way that is holistic, scalable, and foolproof.**

The core challenges include:

- **Fragmented Security Models:** Each system implements application-level security differently:
  - Pharma Pulse uses Roles and Teams
  - People Partner uses Payroll Groups
  - HR app has team-level restrictions
  - ESS has employee-level self-service boundaries
  - SAP has its own authorization framework
  
  There is no unified framework to translate these diverse security models into consistent data access rules when querying across systems.

- **No Centralized Data Governance:** When attempting to aggregate or query data across multiple systems (e.g., "Show me all project expenses handled by my team"), there is no standardized mechanism to ensure that the original security boundaries of each source system are preserved and respected.

- **Scalability & Maintenance Challenges:** 
  - Adding new data sources requires manually implementing security checks for each integration point.
  - Organizational changes (e.g., restructuring departments) require updates across multiple disconnected security configurations.
  - This manual, fragmented approach is error-prone and does not scale.

- **Lack of Foolproof Guarantees:** The current approach relies on application-level security checks that must be manually replicated for each data access path. There is no architectural layer that fundamentally prevents unauthorized data from being retrieved if any integration is misconfigured.

### 5.3 Objective

**The objective is to design and implement a secure data access architecture that:**
- Respects the existing security models of all source systems
- Provides a unified, scalable approach to data retrieval
- Guarantees that users can only access data they are authorized to view, regardless of how the query is constructed
- Can adapt to organizational changes and new data sources without requiring extensive manual reconfiguration

---

## 6. Future Enhancements (Excluded from V1)

The following features are **explicitly out of scope** for Version 1 and will be considered for future releases:

### V2 Candidate Features:
- **Multi-Factor Authentication (MFA)** for enhanced security
- **Voice Input/Output** for hands-free querying
- **Advanced Analytics Dashboard** showing query patterns and system usage
- **Scheduled Queries** with email/notification delivery
- **Custom Data Connectors** for additional enterprise systems
- **Mobile App** (iOS/Android native clients)

### V3 Candidate Features:
- **Team Collaboration Mode** (shared chat sessions)
- **AI Model Fine-Tuning** on organizational jargon and data patterns
- **Real-Time Data Streaming** from live sources
- **Integration with BI Tools** (Power BI, Tableau embedding)
- **Multi-Language Support** (currently English only)

---

## 7. Version Control & Document Updates

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| V1.0 | 2026-02-06 | Product Team | Initial FSD for AtcoGenie V1 |

---

**End of Document**
