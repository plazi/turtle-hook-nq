const response = await fetch("http://localhost:4505", {
  method: "POST",
  body: `{
  "ref": "refs/heads/main",
  "before": "fa509fa1cb711e0ee98312f89973dd3a5f26769c",
  "after": "9ec7f988390afbd38b1909476d4aab6700ec7382",
  "repository": {
    "id": 220027861,
    "node_id": "MDEwOlJlcG9zaXRvcnkyMjAwMjc4NjE=",
    "name": "treatments-rdf",
    "full_name": "plazi/treatments-rdf",
    "private": false,
    "owner": {
      "name": "plazi",
      "email": "agosti@plazi.org",
      "login": "plazi",
      "id": 3786794,
      "node_id": "MDEyOk9yZ2FuaXphdGlvbjM3ODY3OTQ=",
      "avatar_url": "https://avatars.githubusercontent.com/u/3786794?v=4",
      "gravatar_id": "",
      "url": "https://api.github.com/users/plazi",
      "html_url": "https://github.com/plazi",
      "followers_url": "https://api.github.com/users/plazi/followers",
      "following_url": "https://api.github.com/users/plazi/following{/other_user}",
      "gists_url": "https://api.github.com/users/plazi/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/plazi/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/plazi/subscriptions",
      "organizations_url": "https://api.github.com/users/plazi/orgs",
      "repos_url": "https://api.github.com/users/plazi/repos",
      "events_url": "https://api.github.com/users/plazi/events{/privacy}",
      "received_events_url": "https://api.github.com/users/plazi/received_events",
      "type": "Organization",
      "site_admin": false
    },
    "html_url": "https://github.com/plazi/treatments-rdf",
    "description": "The treatments as RDF in Turtle",
    "fork": false,
    "url": "https://github.com/plazi/treatments-rdf",
    "forks_url": "https://api.github.com/repos/plazi/treatments-rdf/forks",
    "keys_url": "https://api.github.com/repos/plazi/treatments-rdf/keys{/key_id}",
    "collaborators_url": "https://api.github.com/repos/plazi/treatments-rdf/collaborators{/collaborator}",
    "teams_url": "https://api.github.com/repos/plazi/treatments-rdf/teams",
    "hooks_url": "https://api.github.com/repos/plazi/treatments-rdf/hooks",
    "issue_events_url": "https://api.github.com/repos/plazi/treatments-rdf/issues/events{/number}",
    "events_url": "https://api.github.com/repos/plazi/treatments-rdf/events",
    "assignees_url": "https://api.github.com/repos/plazi/treatments-rdf/assignees{/user}",
    "branches_url": "https://api.github.com/repos/plazi/treatments-rdf/branches{/branch}",
    "tags_url": "https://api.github.com/repos/plazi/treatments-rdf/tags",
    "blobs_url": "https://api.github.com/repos/plazi/treatments-rdf/git/blobs{/sha}",
    "git_tags_url": "https://api.github.com/repos/plazi/treatments-rdf/git/tags{/sha}",
    "git_refs_url": "https://api.github.com/repos/plazi/treatments-rdf/git/refs{/sha}",
    "trees_url": "https://api.github.com/repos/plazi/treatments-rdf/git/trees{/sha}",
    "statuses_url": "https://api.github.com/repos/plazi/treatments-rdf/statuses/{sha}",
    "languages_url": "https://api.github.com/repos/plazi/treatments-rdf/languages",
    "stargazers_url": "https://api.github.com/repos/plazi/treatments-rdf/stargazers",
    "contributors_url": "https://api.github.com/repos/plazi/treatments-rdf/contributors",
    "subscribers_url": "https://api.github.com/repos/plazi/treatments-rdf/subscribers",
    "subscription_url": "https://api.github.com/repos/plazi/treatments-rdf/subscription",
    "commits_url": "https://api.github.com/repos/plazi/treatments-rdf/commits{/sha}",
    "git_commits_url": "https://api.github.com/repos/plazi/treatments-rdf/git/commits{/sha}",
    "comments_url": "https://api.github.com/repos/plazi/treatments-rdf/comments{/number}",
    "issue_comment_url": "https://api.github.com/repos/plazi/treatments-rdf/issues/comments{/number}",
    "contents_url": "https://api.github.com/repos/plazi/treatments-rdf/contents/{+path}",
    "compare_url": "https://api.github.com/repos/plazi/treatments-rdf/compare/{base}...{head}",
    "merges_url": "https://api.github.com/repos/plazi/treatments-rdf/merges",
    "archive_url": "https://api.github.com/repos/plazi/treatments-rdf/{archive_format}{/ref}",
    "downloads_url": "https://api.github.com/repos/plazi/treatments-rdf/downloads",
    "issues_url": "https://api.github.com/repos/plazi/treatments-rdf/issues{/number}",
    "pulls_url": "https://api.github.com/repos/plazi/treatments-rdf/pulls{/number}",
    "milestones_url": "https://api.github.com/repos/plazi/treatments-rdf/milestones{/number}",
    "notifications_url": "https://api.github.com/repos/plazi/treatments-rdf/notifications{?since,all,participating}",
    "labels_url": "https://api.github.com/repos/plazi/treatments-rdf/labels{/name}",
    "releases_url": "https://api.github.com/repos/plazi/treatments-rdf/releases{/id}",
    "deployments_url": "https://api.github.com/repos/plazi/treatments-rdf/deployments",
    "created_at": 1573053817,
    "updated_at": "2022-01-11T01:26:21Z",
    "pushed_at": 1651887538,
    "git_url": "git://github.com/plazi/treatments-rdf.git",
    "ssh_url": "git@github.com:plazi/treatments-rdf.git",
    "clone_url": "https://github.com/plazi/treatments-rdf.git",
    "svn_url": "https://github.com/plazi/treatments-rdf",
    "homepage": null,
    "size": 1221326,
    "stargazers_count": 0,
    "watchers_count": 0,
    "language": null,
    "has_issues": true,
    "has_projects": true,
    "has_downloads": true,
    "has_wiki": true,
    "has_pages": false,
    "forks_count": 1,
    "mirror_url": null,
    "archived": false,
    "disabled": false,
    "open_issues_count": 1,
    "license": null,
    "allow_forking": true,
    "is_template": false,
    "topics": [

    ],
    "visibility": "public",
    "forks": 1,
    "open_issues": 1,
    "watchers": 0,
    "default_branch": "main",
    "stargazers": 0,
    "master_branch": "main",
    "organization": "plazi"
  },
  "pusher": {
    "name": "nleanba",
    "email": "noam@helou.ch"
  },
  "organization": {
    "login": "plazi",
    "id": 3786794,
    "node_id": "MDEyOk9yZ2FuaXphdGlvbjM3ODY3OTQ=",
    "url": "https://api.github.com/orgs/plazi",
    "repos_url": "https://api.github.com/orgs/plazi/repos",
    "events_url": "https://api.github.com/orgs/plazi/events",
    "hooks_url": "https://api.github.com/orgs/plazi/hooks",
    "issues_url": "https://api.github.com/orgs/plazi/issues",
    "members_url": "https://api.github.com/orgs/plazi/members{/member}",
    "public_members_url": "https://api.github.com/orgs/plazi/public_members{/member}",
    "avatar_url": "https://avatars.githubusercontent.com/u/3786794?v=4",
    "description": "Plazi is an association supporting and promoting the development of persistent and openly accessible digital taxonomic literature."
  },
  "sender": {
    "login": "nleanba",
    "id": 25827850,
    "node_id": "MDQ6VXNlcjI1ODI3ODUw",
    "avatar_url": "https://avatars.githubusercontent.com/u/25827850?v=4",
    "gravatar_id": "",
    "url": "https://api.github.com/users/nleanba",
    "html_url": "https://github.com/nleanba",
    "followers_url": "https://api.github.com/users/nleanba/followers",
    "following_url": "https://api.github.com/users/nleanba/following{/other_user}",
    "gists_url": "https://api.github.com/users/nleanba/gists{/gist_id}",
    "starred_url": "https://api.github.com/users/nleanba/starred{/owner}{/repo}",
    "subscriptions_url": "https://api.github.com/users/nleanba/subscriptions",
    "organizations_url": "https://api.github.com/users/nleanba/orgs",
    "repos_url": "https://api.github.com/users/nleanba/repos",
    "events_url": "https://api.github.com/users/nleanba/events{/privacy}",
    "received_events_url": "https://api.github.com/users/nleanba/received_events",
    "type": "User",
    "site_admin": false
  },
  "created": false,
  "deleted": false,
  "forced": false,
  "base_ref": null,
  "compare": "https://github.com/plazi/treatments-rdf/compare/fa509fa1cb71...9ec7f988390a",
  "commits": [
    {
      "id": "9ec7f988390afbd38b1909476d4aab6700ec7382",
      "tree_id": "a8d4d73f8efb715b6feb257514ca2f2c6dce79a8",
      "distinct": true,
      "message": "committed by action runner plazi/treatments-xml@a04316a23e88eada7534fb5e09d45d30e0fa7d11",
      "timestamp": "2022-05-07T01:38:54Z",
      "url": "https://github.com/plazi/treatments-rdf/commit/9ec7f988390afbd38b1909476d4aab6700ec7382",
      "author": {
        "name": "gsautter",
        "email": "gsautter@users.noreply.github.com",
        "username": "gsautter"
      },
      "committer": {
        "name": "gsautter",
        "email": "gsautter@users.noreply.github.com",
        "username": "gsautter"
      },
      "added": [

      ],
      "removed": [

      ],
      "modified": [
        "data/9B/48/47/9B48474CE8148E14FCD2999E1905E9CD.ttl"
      ]
    }
  ],
  "head_commit": {
    "id": "9ec7f988390afbd38b1909476d4aab6700ec7382",
    "tree_id": "a8d4d73f8efb715b6feb257514ca2f2c6dce79a8",
    "distinct": true,
    "message": "committed by action runner plazi/treatments-xml@a04316a23e88eada7534fb5e09d45d30e0fa7d11",
    "timestamp": "2022-05-07T01:38:54Z",
    "url": "https://github.com/plazi/treatments-rdf/commit/9ec7f988390afbd38b1909476d4aab6700ec7382",
    "author": {
      "name": "gsautter",
      "email": "gsautter@users.noreply.github.com",
      "username": "gsautter"
    },
    "committer": {
      "name": "gsautter",
      "email": "gsautter@users.noreply.github.com",
      "username": "gsautter"
    },
    "added": [

    ],
    "removed": [

    ],
    "modified": [
      "data/9B/48/47/9B48474CE8148E14FCD2999E1905E9CD.ttl"
    ]
  }
}`,
});

console.log(response);
console.log(await response.text());
