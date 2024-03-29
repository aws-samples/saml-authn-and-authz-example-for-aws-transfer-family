# saml-authn-and-authz-example-for-aws-transfer-family

[AWS Transfer Family](https://docs.aws.amazon.com/transfer/latest/userguide/what-is-aws-transfer-family.html) is a secure transfer service that enables you to transfer files into and out of AWS storage services

Independent software vendors (ISVs) who need to provide their customers with a multi-tenant way to transfer files in and out of their solutions while also maintaining isolation of customer data can leverage AWS Transfer Family's ability to map [logical directories to different S3 buckets based on login credentials](https://docs.aws.amazon.com/transfer/latest/userguide/create-user.html). However, it can be a burden on the ISV to manage fine-grained permissions within these logical directories for each customer. 

The following project is an example of a secure multi-tenant file transfer solution that empowers each tenant to manage the fine-grained permissions of users within their own logical directories using [Cognito's ability to configure a SAML provider as an identity pool IdP](https://docs.aws.amazon.com/cognito/latest/developerguide/saml-identity-provider.html) 

# Authentication

![architecture.drawio.png](images%2Farchitecture.drawio.png)


# Mapping of fine-grained permissions

Home directories and fine-grained folder permissions can be managed by each tenant
by providing SAML attributes to be mapped to the following custom attributes

* **custom:atf_home** - The a json object describing the user's home directory and permissions
* **custom:atf_permissions** - An array of json objects for each directory in the tenant folder 

**NOTE** - All directories are scoped to the tenant's bucket. Each tenant will have their own separate bucket.

The json objects in the attributes above should have the following format

```json
{
  "dir": "PATH relative to the tenant's bucket root",
  "permissions": "r|w|rw"
}
```

The permissions are mapped to the following S3 actions

* **r**  - ["s3:GetObject", "s3:GetObjectVersion", "s3:GetObjectACL"]
* **w**  - ["s3:PutObject", "s3:DeleteObjectVersion", "s3:DeleteObject", "s3:PutObjectACL"]
* **rw** - ["s3:GetObject", "s3:GetObjectVersion", "s3:GetObjectACL","s3:PutObject", "s3:DeleteObjectVersion", "s3:DeleteObject", "s3:PutObjectACL"]


