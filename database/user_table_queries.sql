CREATE TABLE dbo.Users (
    UserID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Username NVARCHAR(50) NOT NULL UNIQUE,
    [Password] NVARCHAR(200) NOT NULL,
    CreatedDate DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    LastUpdatedDate DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);


INSERT INTO dbo.Users (Username, [Password])
VALUES     ('test', 'test');
    ('admin', '390a4ab5-a138-48d5-b12f-8b172157c56e'),
    ('test', 'test');

UPDATE dbo.Users
SET [Password] = 'NewP@ssword456', 
    LastUpdatedDate = GETUTCDATE()
WHERE Username = 'john_doe';



INSERT INTO dbo.Users (Username, [Password])
VALUES ('john_doe', HASHBYTES('SHA2_256', 'P@ssword123'));

UPDATE dbo.Users
SET [Password] = HASHBYTES('SHA2_256', 'NewP@ssword456'),
    LastUpdatedDate = GETUTCDATE()
WHERE Username = 'john_doe';


DELETE FROM dbo.Users
WHERE Username = 'john_doe';
