using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace AtcoGenie.Server.Infrastructure.Data.Migrations.Genie
{
    /// <inheritdoc />
    public partial class InitialChatAndFoldersSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "genie");

            migrationBuilder.CreateTable(
                name: "ChatSessions",
                schema: "genie",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    UserId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LastActiveAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsArchived = table.Column<bool>(type: "boolean", nullable: false),
                    ModelId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ChatSessions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Folders",
                schema: "genie",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Folders", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ChatMessages",
                schema: "genie",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ChatSessionId = table.Column<int>(type: "integer", nullable: false),
                    Sender = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    Content = table.Column<string>(type: "text", nullable: false),
                    Timestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ChatMessages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ChatMessages_ChatSessions_ChatSessionId",
                        column: x => x.ChatSessionId,
                        principalSchema: "genie",
                        principalTable: "ChatSessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ChatFolderMappings",
                schema: "genie",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    FolderId = table.Column<int>(type: "integer", nullable: false),
                    ChatSessionId = table.Column<int>(type: "integer", nullable: false),
                    AddedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ChatFolderMappings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ChatFolderMappings_ChatSessions_ChatSessionId",
                        column: x => x.ChatSessionId,
                        principalSchema: "genie",
                        principalTable: "ChatSessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ChatFolderMappings_Folders_FolderId",
                        column: x => x.FolderId,
                        principalSchema: "genie",
                        principalTable: "Folders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ChatFolderMapping_Unique",
                schema: "genie",
                table: "ChatFolderMappings",
                columns: new[] { "FolderId", "ChatSessionId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ChatFolderMappings_ChatSessionId",
                schema: "genie",
                table: "ChatFolderMappings",
                column: "ChatSessionId");

            migrationBuilder.CreateIndex(
                name: "IX_ChatFolderMappings_FolderId_AddedAt",
                schema: "genie",
                table: "ChatFolderMappings",
                columns: new[] { "FolderId", "AddedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ChatMessages_ChatSessionId_Timestamp",
                schema: "genie",
                table: "ChatMessages",
                columns: new[] { "ChatSessionId", "Timestamp" });

            migrationBuilder.CreateIndex(
                name: "IX_ChatSessions_UserId_IsArchived",
                schema: "genie",
                table: "ChatSessions",
                columns: new[] { "UserId", "IsArchived" });

            migrationBuilder.CreateIndex(
                name: "IX_Folder_UserId_Name_Unique",
                schema: "genie",
                table: "Folders",
                columns: new[] { "UserId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Folders_UserId_SortOrder",
                schema: "genie",
                table: "Folders",
                columns: new[] { "UserId", "SortOrder" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ChatFolderMappings",
                schema: "genie");

            migrationBuilder.DropTable(
                name: "ChatMessages",
                schema: "genie");

            migrationBuilder.DropTable(
                name: "Folders",
                schema: "genie");

            migrationBuilder.DropTable(
                name: "ChatSessions",
                schema: "genie");
        }
    }
}
