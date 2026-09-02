CREATE TABLE "VirtualFolder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VirtualFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "VirtualFolder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VirtualFolder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "VirtualFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "googleFileId" TEXT NOT NULL,
    "virtualFolderId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VirtualFile_virtualFolderId_fkey" FOREIGN KEY ("virtualFolderId") REFERENCES "VirtualFolder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VirtualFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "VirtualFile_googleFileId_key" ON "VirtualFile"("googleFileId");
