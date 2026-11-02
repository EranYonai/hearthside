#!/usr/bin/perl
# Makes an encrypted database dump on request and sends it back. Nothing is written
# to disk. Listens on the internal network only; the web app is the only caller and
# proves itself with the database password (both already hold it).
#
#   GET /dump   Authorization: Bearer <db password>   ->  age-encrypted pg_dump
use strict;
use warnings;
use IO::Socket::INET;

my $port = $ENV{BACKUP_PORT} || 8080;
my $recipient = $ENV{BACKUP_RECIPIENT} || '';
my $pwfile = $ENV{DATABASE_PASSWORD_FILE} || '/run/secrets/db_password';
open(my $fh, '<', $pwfile) or die "no password file\n";
my $password = <$fh>;
close $fh;
$password =~ s/\s+$//;
$ENV{PGPASSWORD} = $password;
$SIG{CHLD} = 'IGNORE';

sub logline { printf STDOUT "{\"level\":\"%s\",\"msg\":\"%s\"}\n", @_; }
sub reply {
  my ($c, $status, $body) = @_;
  print $c "HTTP/1.1 $status\r\nContent-Type: text/plain\r\nContent-Length: "
    . length($body) . "\r\nConnection: close\r\n\r\n$body";
}

$| = 1;
my $server = IO::Socket::INET->new(LocalPort => $port, Listen => 5, ReuseAddr => 1)
  or die "listen: $!\n";
logline('info', "backup service ready" . ($recipient ? '' : ' (no BACKUP_RECIPIENT set)'));

while (my $c = $server->accept) {
  my $pid = fork();
  if (!defined $pid) { close $c; next; }
  if ($pid) { close $c; next; }
  $SIG{CHLD} = 'DEFAULT';
  $c->autoflush(1);
  my $line = <$c> // '';
  my ($method, $path) = $line =~ m{^(\S+)\s+(\S+)};
  my $auth = '';
  my $extra = '';
  while (my $h = <$c>) {
    last if $h =~ /^\r?\n$/;
    $auth = $1 if $h =~ /^Authorization:\s*Bearer\s+(\S+)/i;
    # A second key (the owner's passkey key), also a public age key.
    $extra = $1 if $h =~ /^X-Backup-Recipient:\s*(age1[02-9ac-hj-np-z]{58})\s*$/i;
  }
  $method //= '';
  $path //= '';
  if ($method eq 'GET' && $path eq '/health') { reply($c, '200 OK', "ok\n"); exit 0; }
  if ($method ne 'GET' || $path ne '/dump') { reply($c, '404 Not Found', "not found\n"); exit 0; }
  if ($auth ne $password) { reply($c, '403 Forbidden', "forbidden\n"); exit 0; }
  if (!$recipient) { reply($c, '503 Service Unavailable', "no backup key set\n"); exit 0; }
  # Held in memory (never on disk) so a failed dump is an error, not a cut-off file.
  my $host = $ENV{PGHOST} || 'db';
  my $user = $ENV{PGUSER} || 'hearthside';
  my $db = $ENV{PGDATABASE} || 'hearthside';
  open(my $out, '-|', 'bash', '-c',
    'set -o pipefail; r="-r $4"; [ -n "$5" ] && r="$r -r $5";'
      . ' pg_dump -h "$1" -U "$2" -d "$3" --format=custom --no-owner | age $r',
    'sh', $host, $user, $db, $recipient, $extra) or exit 1;
  binmode $out;
  my $data = do { local $/; <$out> } // '';
  close $out;
  if ($? != 0 || length($data) == 0) {
    logline('error', 'backup failed');
    reply($c, '500 Internal Server Error', "dump failed\n");
    exit 0;
  }
  print $c "HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: "
    . length($data) . "\r\nConnection: close\r\n\r\n";
  print $c $data;
  logline('info', 'backup sent');
  close $c;
  exit 0;
}
